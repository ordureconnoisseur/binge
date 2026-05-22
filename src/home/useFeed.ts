import { useCallback, useEffect, useRef, useState } from "react";
import {
    findImagesByGallery,
    type PerformerImageCard,
    type RecentSceneRow,
    type RecentGalleryRow,
} from "../api/queries";
import {
    getRecentScenes,
    getScenesByDate,
    getRecentGalleries,
    getGalleriesByDate,
} from "./recentScenesCache";
import {
    useShowGalleries,
    useLookbackDays,
    useIncludeStashDB,
} from "./pluginSettings";
import {
    fetchDiscoveryFeedItems,
    type DiscoveryFeedItem,
} from "./discoveryFeed";

// Performer summary inside a feed item. Multiple performers per item are
// kept so the card can show their names and route taps to the correct
// profile.
export interface FeedPerformer {
    id: string;
    name: string;
    imagePath: string | null;
}

export interface FeedTag {
    id: string;
    name: string;
}

// One scene-as-post in the feed.
export interface SceneFeedItem {
    kind: "scene";
    key: string;
    sceneId: string;
    title: string | null;
    details: string | null;
    preview: string | null;
    screenshot: string | null;
    createdAt: string;
    date: string | null;
    effectiveAt: string;
    width: number | null;
    height: number | null;
    performers: FeedPerformer[];
    tags: FeedTag[];
}

// One gallery-as-post. `images` is the first MAX_GALLERY_IMAGES of the
// gallery; the carousel pads a "View gallery →" panel at the end so the
// user can jump into the full ImageLightbox.
export interface GalleryFeedItem {
    kind: "gallery";
    key: string;
    galleryId: string;
    title: string | null;
    coverPath: string | null;
    imageCount: number;
    images: PerformerImageCard[];
    createdAt: string;
    date: string | null;
    effectiveAt: string;
    performers: FeedPerformer[];
    // Folder/file paths — used for the temporary debug strip on the
    // gallery card (and for the in-app noise-pattern filter).
    paths: string[];
}

// StashDB discovery card — a scene featuring at least one performer
// the user hasn't added to their library, with a Follow CTA that
// creates that performer locally (scrape + create). Same `key` +
// `effectiveAt` shape as the other variants so the merged feed sort
// stays homogeneous.
export interface DiscoveryFeedItemWrapped extends DiscoveryFeedItem {
    kind: "discovery";
}

export type FeedItem =
    | SceneFeedItem
    | GalleryFeedItem
    | DiscoveryFeedItemWrapped;

export type FeedState =
    | { kind: "loading" }
    | { kind: "ready"; items: FeedItem[] }
    | { kind: "error"; message: string };

// Initial lookback window on Home mount is read from plugin settings
// via useLookbackDays(). Each `loadMore()` widens this by
// LOOKBACK_INCREMENT_DAYS — infinite scroll grows the window rather
// than paging through fixed-size chunks, which keeps the dedupe logic
// trivial (every fetch is a superset of the previous).
const LOOKBACK_INCREMENT_DAYS = 30;
// Hard ceiling so a runaway scroller doesn't query years of history.
const MAX_LOOKBACK_DAYS = 365;
// Per-type cap scales with the lookback so the feed isn't artificially
// truncated as the user paginates. Keeps both content types
// represented when one dominates by recency.
function perTypeLimit(lookbackDays: number): number {
    return Math.min(200, lookbackDays);
}
// Max images per gallery in the carousel — the rest live behind the
// "View gallery →" panel and open in the existing ImageLightbox.
const MAX_GALLERY_IMAGES = 10;

// Path patterns that identify auto-generated / non-photo-set galleries
// the user doesn't want surfaced in the Home feed. The `screen[^/]*`
// rule catches every "screen-prefixed" folder convention we've seen so
// far — Screen, Screens, Screenshot, Screenshots, Screenlist,
// Screenlists, "Screen Previews", "Screen Lists", etc. Plus the
// previously-confirmed short `scr` folder and Cover/Proof art.
// Matched case-insensitively; path separators kept generic so Windows
// (`\`) and Unix (`/`) layouts both work.
const NOISE_GALLERY_PATTERNS: RegExp[] = [
    /[\\/]screen[^\\/]*(?=[\\/]|$)/i,
    /[\\/]scr(?=[\\/]|$)/i,
    /[\\/]covers?(?=[\\/]|$)/i,
    /[\\/]proof(?=[\\/]|$)/i,
];

function isNoiseGallery(paths: string[]): boolean {
    for (const p of paths) {
        for (const re of NOISE_GALLERY_PATTERNS) {
            if (re.test(p)) return true;
        }
    }
    return false;
}

export interface FeedHookResult {
    state: FeedState;
    loadMore: () => void;
    isLoadingMore: boolean;
    hasMore: boolean;
}

export function useFeed(): FeedHookResult {
    const initialLookbackDays = useLookbackDays();
    const [state, setState] = useState<FeedState>({ kind: "loading" });
    const [lookbackDays, setLookbackDays] = useState(initialLookbackDays);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const showGalleries = useShowGalleries();
    const includeStashDB = useIncludeStashDB();

    // When the user picks a new lookback in plugin settings, snap the
    // current window back to that value so the feed re-fetches with
    // the new horizon (rather than retaining a wider window from a
    // previous load-more chain).
    useEffect(() => {
        setLookbackDays(initialLookbackDays);
    }, [initialLookbackDays]);
    // Heuristic: if a widened-window fetch returns the same total count
    // as the previous one, we've hit the end of the user's history —
    // stop offering loadMore.
    const prevTotalRef = useRef(0);
    const hasMoreRef = useRef(true);

    useEffect(() => {
        let alive = true;
        const sinceIso = new Date(
            Date.now() - lookbackDays * 24 * 3600 * 1000
        ).toISOString();
        // "Initial" = the user's configured starting window; subsequent
        // loadMore() bumps widen past it.
        const isInitial = lookbackDays === initialLookbackDays;
        if (!isInitial) setIsLoadingMore(true);

        // Stash's date fields are YYYY-MM-DD strings (DateCriterionInput),
        // distinct from the full-precision ISO timestamps used for
        // created_at (TimestampCriterionInput). Need both shapes.
        const sinceDate = sinceIso.slice(0, 10);

        (async () => {
            try {
                // 4 parallel fetches: two filters × two content types.
                // - "byCreated" catches recently-added items
                // - "byDate" catches items with recent release dates
                //   even if they've been in the library for years
                // We then dedupe each type by id before merging. Both
                // use the shared cache so subsequent Home visits reuse
                // the same Promises.
                const [
                    scenesByCreated,
                    scenesByDate,
                    galleriesByCreated,
                    galleriesByDate,
                    discoveryItems,
                ] = await Promise.all([
                    getRecentScenes(sinceIso),
                    getScenesByDate(sinceDate),
                    // Skip the gallery queries entirely when the user
                    // has turned them off — saves a round-trip and N
                    // per-gallery image fetches.
                    showGalleries
                        ? getRecentGalleries(sinceIso)
                        : Promise.resolve([] as RecentGalleryRow[]),
                    showGalleries
                        ? getGalleriesByDate(sinceDate)
                        : Promise.resolve([] as RecentGalleryRow[]),
                    // StashDB discovery — scenes featuring unfollowed
                    // performers. Same toggle as the stories-row
                    // StashDB integration; both surface or both
                    // hide together so the user has one switch.
                    // Failures swallowed inside fetchDiscoveryFeedItems
                    // so a StashDB outage never breaks the feed.
                    includeStashDB
                        ? fetchDiscoveryFeedItems(sinceDate)
                        : Promise.resolve([] as DiscoveryFeedItem[]),
                ]);
                if (!alive) return;

                // Dedupe rows by sceneId / galleryId — a scene might
                // appear in both query results when its created_at AND
                // date both fall inside the window.
                const sceneRows = dedupeSceneRows([
                    ...scenesByCreated,
                    ...scenesByDate,
                ]);
                const galleryRows = dedupeGalleries([
                    ...galleriesByCreated,
                    ...galleriesByDate,
                ]).filter((g) => !isNoiseGallery(g.paths));

                // Collapse scene rows (one row per scene/performer pair)
                // into one item per scene; gather all matching performers.
                const sceneItems = new Map<string, SceneFeedItem>();
                for (const r of sceneRows) {
                    let item = sceneItems.get(r.sceneId);
                    if (!item) {
                        item = {
                            kind: "scene",
                            key: `scene:${r.sceneId}`,
                            sceneId: r.sceneId,
                            title: r.sceneTitle,
                            details: r.sceneDetails,
                            preview: r.scenePreview,
                            screenshot: r.sceneScreenshot,
                            createdAt: r.sceneCreatedAt,
                            date: r.sceneDate,
                            effectiveAt: r.sceneDate ?? r.sceneCreatedAt,
                            width: r.sceneWidth,
                            height: r.sceneHeight,
                            performers: [],
                            tags: r.sceneTags,
                        };
                        sceneItems.set(r.sceneId, item);
                    }
                    item.performers.push({
                        id: r.performerId,
                        name: r.performerName,
                        imagePath: r.performerImagePath,
                    });
                }

                // Fetch the first N images for each gallery in
                // parallel. Capped (grows with lookback) to avoid an
                // explosion of round-trips on huge libraries.
                const cap = perTypeLimit(lookbackDays);
                const cappedGalleryRows = galleryRows.slice(0, cap);
                const galleryImageLists = await Promise.all(
                    cappedGalleryRows.map((g) =>
                        findImagesByGallery(
                            g.galleryId,
                            MAX_GALLERY_IMAGES
                        ).catch(() => [] as PerformerImageCard[])
                    )
                );
                if (!alive) return;

                const galleryItems: GalleryFeedItem[] = cappedGalleryRows.map(
                    (g, i) => ({
                        kind: "gallery",
                        key: `gallery:${g.galleryId}`,
                        galleryId: g.galleryId,
                        title: g.title,
                        coverPath: g.coverPath,
                        imageCount: g.imageCount,
                        images: galleryImageLists[i] ?? [],
                        createdAt: g.createdAt,
                        date: g.date,
                        effectiveAt: g.date ?? g.createdAt,
                        performers: g.performers.map((p) => ({
                            id: p.id,
                            name: p.name,
                            imagePath: p.image_path,
                        })),
                        paths: g.paths,
                    })
                );

                // Cap each type INDEPENDENTLY (sorted DESC by
                // effectiveAt) before merging. Without this, whichever
                // type happens to have more recent timestamps wins all
                // the slots — e.g., a recent gallery import scan
                // stamps every gallery with today's created_at, which
                // would otherwise push every scene out of the feed.
                const sceneList = Array.from(sceneItems.values())
                    .sort((a, b) =>
                        b.effectiveAt.localeCompare(a.effectiveAt)
                    )
                    .slice(0, cap);
                // galleryList intentionally NOT pre-sorted — the
                // merged sort below re-orders the whole list anyway,
                // and galleryItems is small enough that the cap step
                // (which the scene side does) doesn't apply here.

                const wrappedDiscovery: DiscoveryFeedItemWrapped[] =
                    discoveryItems.map((d) => ({ kind: "discovery", ...d }));

                const all: FeedItem[] = [
                    ...sceneList,
                    ...galleryItems,
                    ...wrappedDiscovery,
                ].sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));

                // End-of-history detection: if widening the window
                // didn't add any new items, the user has scrolled past
                // everything Stash has.
                if (!isInitial && all.length === prevTotalRef.current) {
                    hasMoreRef.current = false;
                }
                prevTotalRef.current = all.length;
                setState({ kind: "ready", items: all });
            } catch (err) {
                if (!alive) return;
                setState({
                    kind: "error",
                    message: err instanceof Error ? err.message : String(err),
                });
            } finally {
                if (alive) setIsLoadingMore(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [lookbackDays, showGalleries, includeStashDB]);

    const loadMore = useCallback(() => {
        setLookbackDays((d) =>
            Math.min(d + LOOKBACK_INCREMENT_DAYS, MAX_LOOKBACK_DAYS)
        );
    }, []);

    const hasMore =
        hasMoreRef.current && lookbackDays < MAX_LOOKBACK_DAYS;

    return { state, loadMore, isLoadingMore, hasMore };
}

// Dedupe scene rows by sceneId. Rows are scene/performer pairs, so a
// single scene with multiple performers contributes multiple rows; we
// must NOT collapse across performers, only across duplicate (sceneId,
// performerId) pairs introduced by merging the two query result sets.
function dedupeSceneRows(rows: RecentSceneRow[]): RecentSceneRow[] {
    const seen = new Set<string>();
    const out: RecentSceneRow[] = [];
    for (const r of rows) {
        const key = `${r.sceneId}:${r.performerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}

function dedupeGalleries(rows: RecentGalleryRow[]): RecentGalleryRow[] {
    const seen = new Set<string>();
    const out: RecentGalleryRow[] = [];
    for (const r of rows) {
        if (seen.has(r.galleryId)) continue;
        seen.add(r.galleryId);
        out.push(r);
    }
    return out;
}
