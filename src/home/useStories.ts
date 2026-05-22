import { useCallback, useEffect, useState } from "react";
import {
    getRecentScenes,
    getScenesByDate,
    invalidateRecentScenes,
    invalidateRecentGalleries,
} from "./recentScenesCache";
import {
    getStashDBBox,
    getLinkedPerformers,
    getOwnedStashDBSceneIds,
    getNewStashDBScenesForPerformers,
    readStashDBCache,
    writeStashDBCache,
    invalidateStashDBCache,
    type StashDBScene,
    type LinkedPerformer,
} from "../api/stashdb";
import {
    getCachedRedditStories,
    invalidateRedditCaches,
} from "./redditCache";
import { rewriteStashAssetUrl } from "../api/bingeServer";
import {
    useIncludeReddit,
    useIncludeStashDB,
    useLookbackDays,
} from "./pluginSettings";

// A single scene inside a performer's story strip. Discriminated by
// `source`: library scenes have preview WebMs + native dimensions and
// open the existing playback flow; stashdb scenes only carry a cover
// image and link out to stashdb.org via the viewer's CTA.
//
// `effectiveAt` is the scene's release date with library-add date as a
// fallback — the universal sort key the viewer uses for ordering.
interface LibraryStoryScene {
    id: string;
    source: "library";
    title: string | null;
    preview: string | null;
    screenshot: string | null;
    date: string | null;
    createdAt: string;
    effectiveAt: string;
    width: number | null;
    height: number | null;
}
interface StashDBStoryScene {
    id: string;
    source: "stashdb";
    title: string | null;
    // Cover image URL hosted by StashDB. No preview WebM available.
    cover: string | null;
    date: string | null; // release date
    effectiveAt: string;
    // External URL — viewer's "View on StashDB →" CTA opens this.
    stashboxUrl: string;
}
// A single Reddit post in a performer's strip. Discriminated further
// by `kind` so the viewer renders image / video / text / link
// differently. `mediaUrl` is the direct image URL or resolved mp4
// (redgifs already resolved by binge-server). `permalink` is the
// reddit.com URL the CTA bar opens.
interface RedditStoryPost {
    id: string;
    source: "reddit";
    kind: "image" | "video" | "text" | "link";
    title: string | null;
    body: string | null;
    mediaUrl: string | null;
    linkUrl: string | null;
    thumbUrl: string | null;
    permalink: string;
    domain: string | null;
    createdUtc: number;
    effectiveAt: string;
}
export type StoryScene =
    | LibraryStoryScene
    | StashDBStoryScene
    | RedditStoryPost;

// One story = one performer + their list of recent scenes.
export interface Story {
    performerId: string;
    performerName: string;
    performerImagePath: string | null;
    performerFavorite: boolean;
    scenes: StoryScene[];
    latestEffectiveAt: string;
}

export type StoriesState =
    | { kind: "loading" }
    | { kind: "ready"; stories: Story[] }
    | { kind: "error"; message: string };

export interface StoriesResult {
    state: StoriesState;
    refresh: () => void;
    refreshing: boolean;
}

// Lookback window for "new" scenes — read from plugin settings via
// useLookbackDays(). Drives both the library `created_at` filter and
// the StashDB `release_date` filter. User-configurable.

// Cap on performers shown. Generous because the row scrolls
// horizontally and an active library can have 100+ performers with
// new content in the lookback window. Per-performer scenes are
// intentionally NOT capped — a prolific performer with 20 new scenes
// gets a long progress strip, which matches IG and is fine UX.
const MAX_STORIES = 150;

export function useStories(): StoriesResult {
    const [state, setState] = useState<StoriesState>({ kind: "loading" });
    const includeStashDB = useIncludeStashDB();
    const includeReddit = useIncludeReddit();
    const lookbackDays = useLookbackDays();
    // Bumped by refresh() to force the effect below to re-run after
    // all in-memory/localStorage caches have been invalidated.
    const [refreshTick, setRefreshTick] = useState(0);

    const refresh = useCallback(() => {
        invalidateRecentScenes();
        invalidateRecentGalleries();
        invalidateStashDBCache();
        invalidateRedditCaches();
        setRefreshTick((n) => n + 1);
    }, []);

    useEffect(() => {
        let alive = true;
        const sinceIso = new Date(
            Date.now() - lookbackDays * 24 * 3600 * 1000
        ).toISOString();
        const sinceIsoDate = sinceIso.slice(0, 10);

        (async () => {
            try {
                // Pull BOTH "added recently" (created_at) and "released
                // recently" (date) — same pattern useFeed uses. Without
                // the date query, a freshly-released scene that was
                // imported to the library months ago would be missing
                // from the stories row while still showing in the feed.
                const [recentRows, dateRows] = await Promise.all([
                    getRecentScenes(sinceIso),
                    getScenesByDate(sinceIsoDate),
                ]);
                if (!alive) return;
                console.debug(
                    "[binge:useStories] recentRows=" +
                        recentRows.length +
                        " dateRows=" +
                        dateRows.length
                );

                // Merge + dedupe by (sceneId, performerId): a scene
                // matching both queries should contribute one row per
                // performer, not two.
                const seen = new Set<string>();
                const rows = [];
                for (const r of [...recentRows, ...dateRows]) {
                    const key = r.sceneId + "|" + r.performerId;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    rows.push(r);
                }

                // Group rows by performer; within each performer also
                // dedupe scenes by id (a scene with two matching
                // performers contributes a row per performer; we don't
                // want it twice in one performer's strip — but the same
                // scene CAN appear in two different performers' strips).
                const byPerformer = new Map<string, PerformerBucket>();
                for (const r of rows) {
                    const effectiveAt = r.sceneDate ?? r.sceneCreatedAt;
                    let bucket = byPerformer.get(r.performerId);
                    if (!bucket) {
                        bucket = {
                            story: {
                                performerId: r.performerId,
                                performerName: r.performerName,
                                performerImagePath: r.performerImagePath,
                                performerFavorite: r.performerFavorite,
                            },
                            librarySceneIds: new Set(),
                            library: [],
                            stashdb: [],
                            reddit: [],
                        };
                        byPerformer.set(r.performerId, bucket);
                    }
                    if (bucket.librarySceneIds.has(r.sceneId)) continue;
                    bucket.librarySceneIds.add(r.sceneId);
                    bucket.library.push({
                        id: r.sceneId,
                        source: "library",
                        title: r.sceneTitle,
                        preview: r.scenePreview,
                        screenshot: r.sceneScreenshot,
                        date: r.sceneDate,
                        createdAt: r.sceneCreatedAt,
                        effectiveAt,
                        width: r.sceneWidth,
                        height: r.sceneHeight,
                    });
                }

                // ── StashDB merge (toggled by plugin setting) ─────
                if (includeStashDB) {
                    await mergeStashDBScenes(byPerformer, sinceIsoDate);
                    if (!alive) return;
                }

                // ── Reddit merge (toggled by plugin setting) ──────
                if (includeReddit) {
                    const sinceUtc = Math.floor(
                        (Date.now() - lookbackDays * 24 * 3600 * 1000) /
                            1000
                    );
                    await mergeRedditPosts(byPerformer, sinceUtc);
                    if (!alive) return;
                }

                // Build final story list. Library scenes always come
                // first within a performer (so playable items sit at
                // the head of the progress strip); StashDB scenes
                // follow as the "discovery tail".
                const stories: Story[] = [];
                for (const bucket of byPerformer.values()) {
                    const lib = bucket.library
                        .slice()
                        .sort((a, b) =>
                            b.effectiveAt.localeCompare(a.effectiveAt)
                        );
                    const sdb = bucket.stashdb
                        .slice()
                        .sort((a, b) =>
                            b.effectiveAt.localeCompare(a.effectiveAt)
                        );
                    const red = bucket.reddit
                        .slice()
                        .sort((a, b) =>
                            b.effectiveAt.localeCompare(a.effectiveAt)
                        );
                    const sceneList = [...lib, ...sdb, ...red];
                    if (sceneList.length === 0) continue;
                    // Row-order key uses the most-recent across BOTH
                    // sources so a performer with a fresh StashDB
                    // release surfaces even if their library scenes
                    // are older.
                    const latestEffectiveAt =
                        sceneList
                            .map((s) => s.effectiveAt)
                            .reduce(
                                (max, t) =>
                                    t.localeCompare(max) > 0 ? t : max,
                                sceneList[0].effectiveAt
                            );
                    stories.push({
                        ...bucket.story,
                        scenes: sceneList,
                        latestEffectiveAt,
                    });
                }
                stories.sort((a, b) =>
                    b.latestEffectiveAt.localeCompare(a.latestEffectiveAt)
                );
                console.debug(
                    "[binge:useStories] performers=" +
                        stories.length +
                        " (cap=" +
                        MAX_STORIES +
                        ")"
                );
                setState({
                    kind: "ready",
                    stories: stories.slice(0, MAX_STORIES),
                });
            } catch (err) {
                if (!alive) return;
                setState({
                    kind: "error",
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        })();

        return () => {
            alive = false;
        };
    }, [includeStashDB, includeReddit, lookbackDays, refreshTick]);

    return {
        state,
        refresh,
        refreshing: state.kind === "loading" && refreshTick > 0,
    };
}

// Per-performer working bucket during the merge phases. Shared between
// the library/stashdb/reddit passes so each can add to a single
// performer's strip.
interface PerformerBucket {
    story: Omit<Story, "scenes" | "latestEffectiveAt">;
    librarySceneIds: Set<string>;
    library: StoryScene[];
    stashdb: StoryScene[];
    reddit: StoryScene[];
    // Set lazily when StashDB merge attaches scenes for a performer
    // we haven't seen locally.
    linkedStashId?: string;
}

// Fetch StashDB new releases for every linked local performer and
// merge them into the per-performer buckets. Owned stash_ids are
// filtered out (the user already has those scenes — they'll surface
// via the library path). 12h cache via stashdb.ts/readStashDBCache.
async function mergeStashDBScenes(
    byPerformer: Map<string, PerformerBucket>,
    sinceIsoDate: string
): Promise<void> {
    const box = await getStashDBBox();
    if (!box) return; // no API key configured
    const linkedPerformers = await getLinkedPerformers();
    if (linkedPerformers.length === 0) return;

    // Map StashDB stash_id → local performer info so we can attach
    // discovered scenes to existing buckets (or create a new bucket
    // for a linked performer with no recent library scenes).
    const stashIdToLocal = new Map<string, LinkedPerformer>();
    for (const p of linkedPerformers) {
        stashIdToLocal.set(p.stashId, p);
    }

    const owned = await getOwnedStashDBSceneIds();

    let scenes: StashDBScene[] | null = readStashDBCache(sinceIsoDate);
    if (!scenes) {
        scenes = await getNewStashDBScenesForPerformers(
            linkedPerformers.map((p) => p.stashId),
            sinceIsoDate,
            box.api_key
        );
        writeStashDBCache(sinceIsoDate, scenes);
    }

    for (const scene of scenes) {
        if (owned.has(scene.id)) continue;
        // A scene with multiple performers attaches to each of their
        // buckets (matching how the library path works).
        for (const stashId of scene.performerStashIds) {
            const local = stashIdToLocal.get(stashId);
            if (!local) continue;
            let bucket = byPerformer.get(local.localId);
            if (!bucket) {
                bucket = {
                    story: {
                        performerId: local.localId,
                        performerName: local.name,
                        performerImagePath: local.imagePath,
                        performerFavorite: local.favorite,
                    },
                    librarySceneIds: new Set(),
                    library: [],
                    stashdb: [],
                    reddit: [],
                    linkedStashId: local.stashId,
                };
                byPerformer.set(local.localId, bucket);
            }
            const effectiveAt =
                scene.releaseDate ?? new Date().toISOString().slice(0, 10);
            bucket.stashdb.push({
                id: `stashdb:${scene.id}`,
                source: "stashdb",
                title: scene.title,
                cover: scene.coverUrl,
                date: scene.releaseDate,
                effectiveAt,
                stashboxUrl: `https://stashdb.org/scenes/${scene.id}`,
            });
        }
    }
}

// Fetch reddit-post digests from binge-server and attach them to the
// per-performer buckets, deduping by mediaUrl across crossposts and
// dropping useless reddit.com-link cards. Performers with reddit-only
// activity get a fresh bucket created from the daemon-returned name +
// image. Daemon unreachable → no-op (caller still renders library +
// stashdb).
async function mergeRedditPosts(
    byPerformer: Map<string, PerformerBucket>,
    sinceUtc: number
): Promise<void> {
    const digests = await getCachedRedditStories(sinceUtc);
    if (!digests) return; // daemon down / fetch failed
    for (const d of digests) {
        const localId = String(d.performerStashId);
        let bucket = byPerformer.get(localId);
        if (!bucket) {
            bucket = {
                story: {
                    performerId: localId,
                    performerName: d.performerName,
                    // binge-server returns image_path with the PC's
                    // tailscale-IP origin; rewrite to a path so the
                    // browser hits Stash same-origin with cookies.
                    performerImagePath:
                        rewriteStashAssetUrl(d.performerImagePath) ||
                        null,
                    performerFavorite: d.performerFavorite,
                },
                librarySceneIds: new Set(),
                library: [],
                stashdb: [],
                reddit: [],
            };
            byPerformer.set(localId, bucket);
        }
        const seen = new Set<string>();
        for (const post of d.posts) {
            // Skip useless crosspost link-cards (domain=reddit.com
            // link-kind, no thumb) — content lives in the linked post.
            if (
                post.kind === "link" &&
                !post.thumbUrl &&
                post.domain === "reddit.com"
            ) {
                continue;
            }
            // Dedupe by mediaUrl across crossposts of the same content.
            if (post.mediaUrl) {
                if (seen.has(post.mediaUrl)) continue;
                seen.add(post.mediaUrl);
            }
            bucket.reddit.push({
                id: `reddit:${post.id}`,
                source: "reddit",
                kind: post.kind,
                title: post.title,
                body: post.body,
                mediaUrl: post.mediaUrl,
                linkUrl: post.linkUrl,
                thumbUrl: post.thumbUrl,
                permalink: post.permalink,
                domain: post.domain,
                createdUtc: post.createdUtc,
                effectiveAt: new Date(
                    post.createdUtc * 1000
                ).toISOString(),
            });
        }
    }
}
