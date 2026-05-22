import { findScenes, type BingeScene } from "../api/queries";

// Weighted-context recommendation algorithm seeded by an Explore-tile
// tap. Each played scene contributes its performers and tags to two
// weighted maps; subsequent picks score candidates by overlap with
// those maps and weighted-randomly pick from the top-N.
//
// Three tunables (defaults below):
//   - chainRate         — fraction of picks that follow context vs
//                         pure-random injection. 0.8 = 4 in 5 chained.
//   - decayRate         — multiplier applied to every weight after a
//                         play. 0.85 ≈ "feel the last 4–5 scenes most".
//   - branchThreshold   — N plays with the same dominant attribute
//                         forces a random injection (escape valve so
//                         the chain doesn't get stuck on one niche).

export const DEFAULT_CHAIN_RATE = 0.8;
export const DEFAULT_DECAY_RATE = 0.85;
export const DEFAULT_BRANCH_THRESHOLD = 4;

// Internal: candidate pool size pulled per attribute. 30 strikes a
// balance — wide enough to give the scorer something to choose from,
// narrow enough that the GraphQL response stays cheap.
const POOL_PER_ATTRIBUTE = 30;
// We take the top K context attributes (by weight) into each query.
// Querying with every performer/tag the user has ever seen would blow
// up the INCLUDES list; the dominant 3 capture intent well enough.
const TOP_K_ATTRIBUTES = 3;
// Number of top-scoring candidates considered for weighted-random
// selection per pick. Larger = less deterministic, more drift.
const TOP_N_FOR_RANDOM_PICK = 10;
// Performer matches feel more meaningful than tag matches when both
// are present (a shared performer ≈ "same person", a shared tag is
// just a vibe). Tunable but kept implicit.
const PERFORMER_SCORE_MULTIPLIER = 1.5;

export interface ChainContext {
    performers: Map<string, number>;
    tags: Map<string, number>;
    visited: Set<string>;
    sameDominantStreak: number;
    lastDominantKey: string | null;
}

export interface ChainAlgoOptions {
    rng?: () => number;
    chainRate?: number;
    decayRate?: number;
    branchThreshold?: number;
    // If a starting scene is provided we add it to `visited` so the
    // algorithm never picks the same scene that seeded the reel.
    initialVisited?: string[];
}

export interface ChainAlgo {
    onPlay(scene: BingeScene): void;
    nextBatch(size: number): Promise<BingeScene[]>;
    getContext(): ChainContext;
}

export function createChainAlgo(opts: ChainAlgoOptions = {}): ChainAlgo {
    const rng = opts.rng ?? Math.random;
    const chainRate = opts.chainRate ?? DEFAULT_CHAIN_RATE;
    const decayRate = opts.decayRate ?? DEFAULT_DECAY_RATE;
    const branchThreshold = opts.branchThreshold ?? DEFAULT_BRANCH_THRESHOLD;

    const ctx: ChainContext = {
        performers: new Map(),
        tags: new Map(),
        visited: new Set(opts.initialVisited ?? []),
        sameDominantStreak: 0,
        lastDominantKey: null,
    };

    // Random sort seed pinned for the lifetime of this algo instance —
    // so the random-injection branch paginates consistently across
    // calls. Re-seeded only when the user re-enters chained mode (a
    // new Explore tile tap creates a fresh algo).
    const randomSeed = `random_${Math.floor(rng() * 1e9)}`;
    let randomPage = 1;

    function dominantOf(map: Map<string, number>, prefix: string): {
        key: string;
        weight: number;
    } | null {
        let bestKey: string | null = null;
        let bestWeight = 0;
        for (const [k, w] of map) {
            if (w > bestWeight) {
                bestKey = k;
                bestWeight = w;
            }
        }
        return bestKey ? { key: `${prefix}:${bestKey}`, weight: bestWeight } : null;
    }

    function recomputeDominant(): void {
        const p = dominantOf(ctx.performers, "p");
        const t = dominantOf(ctx.tags, "t");
        const winner =
            !p ? t : !t ? p : p.weight >= t.weight ? p : t;
        const next = winner?.key ?? null;
        if (next === ctx.lastDominantKey && next !== null) {
            ctx.sameDominantStreak += 1;
        } else {
            ctx.lastDominantKey = next;
            ctx.sameDominantStreak = next === null ? 0 : 1;
        }
    }

    function decay(map: Map<string, number>): void {
        for (const [k, w] of map) {
            const next = w * decayRate;
            // Drop weights that have decayed to negligible to keep the
            // INCLUDES query lists tidy. 0.05 ≈ 6 plays-ago at decay 0.85.
            if (next < 0.05) map.delete(k);
            else map.set(k, next);
        }
    }

    function topK(map: Map<string, number>, k: number): string[] {
        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, k)
            .map((entry) => entry[0]);
    }

    function scoreCandidate(scene: BingeScene): number {
        let score = 0;
        for (const p of scene.performers) {
            score +=
                (ctx.performers.get(p.id) ?? 0) *
                PERFORMER_SCORE_MULTIPLIER;
        }
        for (const t of scene.tags) {
            score += ctx.tags.get(t.id) ?? 0;
        }
        return score;
    }

    // Weighted-random pick from the top N candidates by score.
    // Candidates are pre-sorted DESC by score on entry.
    function weightedPick(sorted: BingeScene[]): BingeScene | null {
        if (sorted.length === 0) return null;
        const top = sorted.slice(0, TOP_N_FOR_RANDOM_PICK);
        const total = top.reduce((s, c) => s + scoreCandidate(c), 0);
        // All zeros — degrade to uniform random across the top slice.
        if (total <= 0) {
            return top[Math.floor(rng() * top.length)];
        }
        let r = rng() * total;
        for (const c of top) {
            r -= scoreCandidate(c);
            if (r <= 0) return c;
        }
        return top[top.length - 1];
    }

    async function fetchRandomBatch(size: number): Promise<BingeScene[]> {
        const data = await findScenes({
            filter: {
                page: randomPage,
                per_page: size,
                sort: randomSeed,
            },
        });
        randomPage += 1;
        return data.findScenes.scenes.filter(
            (s) => !ctx.visited.has(s.id)
        );
    }

    async function fetchChainedCandidates(): Promise<BingeScene[]> {
        const performers = topK(ctx.performers, TOP_K_ATTRIBUTES);
        const tags = topK(ctx.tags, TOP_K_ATTRIBUTES);
        const queries: Promise<{ findScenes: { scenes: BingeScene[] } }>[] = [];
        if (performers.length > 0) {
            queries.push(
                findScenes({
                    filter: {
                        page: 1,
                        per_page: POOL_PER_ATTRIBUTE,
                        sort: "random",
                    },
                    scene_filter: {
                        performers: {
                            value: performers,
                            modifier: "INCLUDES",
                        },
                    },
                })
            );
        }
        if (tags.length > 0) {
            queries.push(
                findScenes({
                    filter: {
                        page: 1,
                        per_page: POOL_PER_ATTRIBUTE,
                        sort: "random",
                    },
                    scene_filter: {
                        tags: { value: tags, modifier: "INCLUDES" },
                    },
                })
            );
        }
        if (queries.length === 0) return [];

        const results = await Promise.all(queries);
        // Union + dedupe + visited-filter.
        const seen = new Set<string>();
        const candidates: BingeScene[] = [];
        for (const res of results) {
            for (const s of res.findScenes.scenes) {
                if (seen.has(s.id)) continue;
                if (ctx.visited.has(s.id)) continue;
                seen.add(s.id);
                candidates.push(s);
            }
        }
        return candidates;
    }

    return {
        onPlay(scene: BingeScene): void {
            ctx.visited.add(scene.id);
            decay(ctx.performers);
            decay(ctx.tags);
            for (const p of scene.performers) {
                ctx.performers.set(
                    p.id,
                    (ctx.performers.get(p.id) ?? 0) + 1
                );
            }
            for (const t of scene.tags) {
                ctx.tags.set(t.id, (ctx.tags.get(t.id) ?? 0) + 1);
            }
            recomputeDominant();
        },

        async nextBatch(size: number): Promise<BingeScene[]> {
            const out: BingeScene[] = [];
            // Fetch a chained candidate pool ONCE per batch — most picks
            // will draw from this. Random injections share the same
            // sort seed so they paginate cleanly across batches.
            let chainedPool = await fetchChainedCandidates();
            // Pre-sort by score so weightedPick can take a top slice.
            chainedPool.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
            const localPicked = new Set<string>();

            const reserveRandom: BingeScene[] = [];
            const ensureRandomReserve = async (): Promise<void> => {
                if (reserveRandom.length > 0) return;
                const fresh = await fetchRandomBatch(Math.max(size, 10));
                for (const s of fresh) {
                    if (!localPicked.has(s.id)) reserveRandom.push(s);
                }
            };

            for (let i = 0; i < size; i++) {
                // Branch-forcing — drop dominant attribute streak via
                // forced random injection. Reset the streak so we don't
                // force-inject again immediately.
                const forceRandom =
                    ctx.sameDominantStreak >= branchThreshold;
                const wantChain =
                    !forceRandom &&
                    ctx.performers.size + ctx.tags.size > 0 &&
                    rng() < chainRate;

                if (wantChain) {
                    // Filter chainedPool against locally-picked (avoid
                    // dup within the same batch).
                    const filteredPool = chainedPool.filter(
                        (s) => !localPicked.has(s.id)
                    );
                    const picked = weightedPick(filteredPool);
                    if (picked) {
                        out.push(picked);
                        localPicked.add(picked.id);
                        continue;
                    }
                    // Pool exhausted — fall through to random injection.
                }

                // Random branch.
                await ensureRandomReserve();
                const picked = reserveRandom.shift();
                if (!picked) break; // library exhausted
                out.push(picked);
                localPicked.add(picked.id);

                if (forceRandom) {
                    // Reset streak counter so the NEXT pick doesn't
                    // also force-random. The actual context update
                    // happens on the next onPlay call.
                    ctx.sameDominantStreak = 0;
                }
            }

            return out;
        },

        getContext(): ChainContext {
            return ctx;
        },
    };
}
