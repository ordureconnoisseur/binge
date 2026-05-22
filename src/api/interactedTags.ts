// Local tracking of the user's recent tag interactions. Every time a
// scene is liked, rated, or bookmarked, the scene's tags get bumped in
// a localStorage-backed ring buffer. Explore's chip row uses this to
// surface the user's most-engaged tags as one-tap filter shortcuts.
//
// Storage shape is a flat ring of {tagId, tagName, ts} entries. We
// score frequency at read time (newer events weighted higher) rather
// than maintaining a sorted aggregate — keeps writes cheap and lets us
// adjust the scoring formula without rewriting old data.

const STORAGE_KEY = "binge.interactedTags";
const RING_LIMIT = 200;
// Events older than this don't contribute to "top tags" — keeps the
// chip row responsive to recent taste shifts.
const FRESH_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

interface InteractionEvent {
    tagId: string;
    tagName: string;
    ts: number;
}

function readRing(): InteractionEvent[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (e): e is InteractionEvent =>
                typeof e === "object" &&
                e != null &&
                typeof e.tagId === "string" &&
                typeof e.tagName === "string" &&
                typeof e.ts === "number"
        );
    } catch {
        return [];
    }
}

function writeRing(ring: InteractionEvent[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ring));
    } catch (err) {
        console.warn("[binge] interactedTags write failed", err);
    }
}

// Record an interaction with a set of tags. Each tag becomes its own
// ring entry — so a scene with 5 tags contributes 5 entries. The ring
// is capped at RING_LIMIT; oldest entries fall off. ASR/APR + binge
// collection tags are filtered out here so they never enter the
// recency ring in the first place — keeps Explore's chip strip clean
// from rating-plumbing noise.
export function recordTagInteractions(
    tags: ReadonlyArray<{ id: string; name: string }>
): void {
    if (tags.length === 0) return;
    const filtered = tags.filter((t) => !isSystemTagName(t.name));
    if (filtered.length === 0) return;
    const now = Date.now();
    const ring = readRing();
    for (const t of filtered) {
        ring.push({ tagId: t.id, tagName: t.name, ts: now });
    }
    if (ring.length > RING_LIMIT) {
        ring.splice(0, ring.length - RING_LIMIT);
    }
    writeRing(ring);
}

// Inlined predicate so this module stays free of an extra import on
// the hot interaction path. Mirrors src/api/tagFilters.ts isSystemTag.
function isSystemTagName(name: string): boolean {
    if (!name) return false;
    if (name.endsWith(" 📁")) return true;
    if (name.endsWith(" ★")) return true;
    if (/^(.+?)\s*:\s*([0-5])$/.test(name) && name.includes(" ★")) return true;
    return false;
}

export interface TagScore {
    tagId: string;
    tagName: string;
    score: number;
    lastSeenAt: number;
}

// Return the top N most-interacted-with tags, ranked by a recency-
// weighted frequency score. Linear decay across FRESH_WINDOW_MS — a
// tag interacted with yesterday counts twice as much as one from 30
// days ago.
export function getTopInteractedTags(limit: number): TagScore[] {
    const ring = readRing();
    if (ring.length === 0) return [];
    const now = Date.now();
    const cutoff = now - FRESH_WINDOW_MS;
    const buckets = new Map<string, TagScore>();
    for (const e of ring) {
        if (e.ts < cutoff) continue;
        const ageRatio = (now - e.ts) / FRESH_WINDOW_MS;
        const weight = Math.max(0, 1 - ageRatio);
        const existing = buckets.get(e.tagId);
        if (existing) {
            existing.score += weight;
            if (e.ts > existing.lastSeenAt) existing.lastSeenAt = e.ts;
        } else {
            buckets.set(e.tagId, {
                tagId: e.tagId,
                tagName: e.tagName,
                score: weight,
                lastSeenAt: e.ts,
            });
        }
    }
    return Array.from(buckets.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

// Wipe the ring. Exposed for a future Settings "reset taste" action.
export function clearTagInteractions(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
