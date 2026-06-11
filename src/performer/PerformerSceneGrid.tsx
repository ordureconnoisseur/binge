import { useEffect, useRef, useState } from "react";
import {
    findScenesByPerformer,
    type PerformerDetail,
    type PerformerSceneCard,
    type PerformerSceneSort,
} from "../api/queries";
import { PerformerSceneSortMenu } from "./PerformerSceneSortMenu";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "../tabs/TabContext";
import {
    getOwnedStashDBSceneIds,
    getStashDBBox,
    getStashDBScenesForPerformer,
    type StashDBScene,
} from "../api/stashdb";
import {
    setIncludeStashDBInProfile,
    useIncludeStashDBInProfile,
    useDemoMode,
} from "../home/pluginSettings";
import { AddSceneModal } from "../home/AddSceneModal";
import { BingeLoading } from "../components/BingeLoading";

interface PerformerSceneGridProps {
    performer: PerformerDetail;
    onClose: () => void;
}

// Mixed-scene cell — discriminates library cards from StashDB-only
// cards. Interleaved by date desc in a single grid.
type GridCell =
    | { kind: "library"; date: string; scene: PerformerSceneCard }
    | {
          kind: "stashdb";
          date: string;
          scene: StashDBScene;
          stashBoxIndex: number;
      };

const STASHDB_ENDPOINT = "https://stashdb.org/graphql";

const PAGE_SIZE = 24;
// Distance from grid bottom that triggers the next page load. Matches the
// Reel's PAGINATE_TRIGGER_DISTANCE feel — load before the user hits the floor.
const NEAR_BOTTOM_PX = 600;

// Paginated grid of poster cards. Tapping a card closes the profile and
// replaces the active filter with `{performers:[this], tags:[], studios:[]}`,
// switching to For You. The scene_filter on the query (INCLUDES performer
// id, sorted date DESC) mirrors what the For You reel sees after the filter
// replacement, so the user enters the reel with the same set of scenes.
export function PerformerSceneGrid({
    performer,
    onClose,
}: PerformerSceneGridProps) {
    const [scenes, setScenes] = useState<PerformerSceneCard[]>([]);
    const [count, setCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<PerformerSceneSort>("recent");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { replace } = useFilter();
    const { setTab, setPinFirstSceneId } = useTab();

    // StashDB mixin state — fetched once when the profile opens.
    // Filtered to scenes the user doesn't already own (owned ids
    // matched against `scene_id` not `id`, since Stash dedupes by
    // stash_id locally and we want to suppress duplicates).
    const includeStashDBInProfile =
        useIncludeStashDBInProfile() && !useDemoMode();
    const [stashDBScenes, setStashDBScenes] = useState<StashDBScene[]>([]);
    const [stashBoxIndex, setStashBoxIndex] = useState<number | null>(null);
    const [sceneModalFor, setSceneModalFor] = useState<{
        sceneId: string;
        title: string | null;
        cover: string | null;
        stashboxUrl: string;
    } | null>(null);

    // True when this performer is actually linked to a stashdb
    // entry — gates the toggle pill in the heading. No link →
    // nothing to fetch, so hide the control entirely.
    const isStashDBLinked = Boolean(
        performer.stash_ids?.some((s) => s.endpoint === STASHDB_ENDPOINT)
    );

    // Reset when the performer changes (re-opening the profile for another
    // id) OR when the sort changes — both restart pagination at page 1 so
    // the next fetch replaces the list instead of appending under the old
    // order. StashDB mixin state only resets on performer change (it's
    // sort-independent), so it's kept out of the sort branch below.
    useEffect(() => {
        setScenes([]);
        setCount(null);
        setPage(1);
        setError(null);
    }, [performer.id, sort]);

    useEffect(() => {
        setStashDBScenes([]);
        setStashBoxIndex(null);
    }, [performer.id]);

    // Re-opening the profile for a different performer should land back on
    // the default sort rather than inherit the previous performer's choice.
    useEffect(() => {
        setSort("recent");
    }, [performer.id]);

    // One-shot StashDB fetch when the toggle is on AND the performer
    // has a stashdb stash_id linked. Fetches their full StashDB
    // catalogue, subtracts owned scenes (we already have them locally
    // — surfacing again would be noise), and stashes the rest for
    // interleaving with the library scenes.
    useEffect(() => {
        if (!includeStashDBInProfile) {
            setStashDBScenes([]);
            return;
        }
        const sdb = performer.stash_ids?.find(
            (s) => s.endpoint === STASHDB_ENDPOINT
        );
        if (!sdb) {
            setStashDBScenes([]);
            return;
        }
        let alive = true;
        (async () => {
            try {
                const box = await getStashDBBox();
                if (!box) return;
                const [list, owned] = await Promise.all([
                    getStashDBScenesForPerformer(sdb.stash_id, box.api_key),
                    getOwnedStashDBSceneIds(),
                ]);
                if (!alive) return;
                setStashBoxIndex(box.index);
                setStashDBScenes(
                    list.filter((s) => !owned.has(s.id))
                );
            } catch (err) {
                console.warn(
                    "[binge] performer-profile stashdb mixin failed",
                    err
                );
            }
        })();
        return () => {
            alive = false;
        };
    }, [performer.id, performer.stash_ids, includeStashDBInProfile]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        findScenesByPerformer(performer.id, page, PAGE_SIZE, sort)
            .then((res) => {
                if (!alive) return;
                setCount(res.count);
                setScenes((prev) =>
                    page === 1 ? res.scenes : [...prev, ...res.scenes]
                );
            })
            .catch((err: Error) => {
                if (!alive) return;
                setError(err.message);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [performer.id, page, sort]);

    // Infinite scroll: observe a sentinel near the grid bottom. The actual
    // scroller is `.binge-profile-body` (the profile's body div), NOT the
    // window — so the observer's root MUST be that container. With the
    // default (viewport) root the sentinel sits inside an independently
    // scrolling element and never crosses the viewport boundary, so page 2
    // never loads (the "only 24 scenes" bug). We resolve the scroll root by
    // walking up from the sentinel.
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        if (count == null) return;
        if (scenes.length >= count) return;
        if (loading) return;

        const scrollRoot = sentinel.closest(".binge-profile-body");
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setPage((p) => p + 1);
                    }
                }
            },
            {
                root: scrollRoot,
                rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px`,
            }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [count, scenes.length, loading]);

    const handlePick = (sceneId: string) => {
        replace({
            performers: [
                {
                    id: performer.id,
                    name: performer.name,
                    image_path: performer.image_path,
                },
            ],
            tags: [],
            studios: [],
        });
        // Tell the Reel to open with this exact scene as slide 0;
        // remaining slides come from the normal random filter feed.
        setPinFirstSceneId(sceneId);
        setTab("foryou");
        onClose();
    };

    // When the toggle is off the effect above resets
    // `stashDBScenes` to [], so no separate "effective" view is
    // needed — fall through with the raw list.
    const effectiveStashDBScenes = stashDBScenes;

    return (
        <section className="binge-profile-scenes">
            <h2 className="binge-profile-scenes-heading">
                {/* The sort control doubles as the section header — its
                    label ("Recent") makes a separate "Scenes (n)" title
                    redundant. */}
                <PerformerSceneSortMenu value={sort} onChange={setSort} />
                {isStashDBLinked && (
                    <button
                        type="button"
                        className={
                            "binge-profile-stashdb-toggle" +
                            (includeStashDBInProfile ? " is-on" : "")
                        }
                        onClick={() =>
                            setIncludeStashDBInProfile(
                                !includeStashDBInProfile
                            )
                        }
                        title="Mix StashDB scenes into this performer's grid"
                    >
                        <span className="binge-profile-stashdb-toggle-dot" />
                        StashDB
                    </button>
                )}
            </h2>
            {error && (
                <div className="binge-status binge-status-error">
                    error: {error}
                </div>
            )}
            {scenes.length === 0 && loading && (
                <BingeLoading minHeight="30vh" />
            )}
            {scenes.length === 0 && !loading && !error && (
                <div className="binge-status">no scenes</div>
            )}
            {(scenes.length > 0 || effectiveStashDBScenes.length > 0) && (
                <ul className="binge-profile-scene-grid">
                    {buildCells(
                        scenes,
                        effectiveStashDBScenes,
                        stashBoxIndex,
                        sort
                    ).map((cell) =>
                        cell.kind === "library" ? (
                            <SceneTile
                                key={`l:${cell.scene.id}`}
                                scene={cell.scene}
                                sort={sort}
                                onPick={() => handlePick(cell.scene.id)}
                            />
                        ) : (
                            <StashDBTile
                                key={`s:${cell.scene.id}`}
                                scene={cell.scene}
                                onPick={() =>
                                    setSceneModalFor({
                                        sceneId: cell.scene.id,
                                        title: cell.scene.title,
                                        cover: cell.scene.coverUrl,
                                        stashboxUrl: `https://stashdb.org/scenes/${cell.scene.id}`,
                                    })
                                }
                            />
                        )
                    )}
                </ul>
            )}
            <div ref={sentinelRef} aria-hidden="true" />
            {loading && scenes.length > 0 && (
                <div className="binge-status binge-profile-scenes-loading">
                    loading more…
                </div>
            )}
            {sceneModalFor && stashBoxIndex !== null && (
                <AddSceneModal
                    stashDBSceneId={sceneModalFor.sceneId}
                    fallbackTitle={sceneModalFor.title}
                    fallbackCover={sceneModalFor.cover}
                    stashboxUrl={sceneModalFor.stashboxUrl}
                    onCreated={() => {
                        // Remove the now-owned scene from the
                        // mixin so it doesn't keep showing as a
                        // discovery card (the user's library will
                        // also surface it via the library path on
                        // the next refresh).
                        setStashDBScenes((prev) =>
                            prev.filter(
                                (s) => s.id !== sceneModalFor.sceneId
                            )
                        );
                        setSceneModalFor(null);
                    }}
                    onClose={() => setSceneModalFor(null)}
                />
            )}
        </section>
    );
}

// Merge library + StashDB scenes into the grid. The library list arrives
// already ordered by the server (per the active sort). For "recent" we
// re-interleave both sources by their effective date DESC — release date,
// falling back to import time (created_at), mirroring the Home feed's
// effectiveAt. For every other sort the ordering key (views / orgasms /
// rating) only exists on library scenes, so we preserve the server order
// and append StashDB tiles at the end rather than mis-sorting them by date.
function buildCells(
    library: PerformerSceneCard[],
    stashDB: StashDBScene[],
    stashBoxIndex: number | null,
    sort: PerformerSceneSort
): GridCell[] {
    const libCells: GridCell[] = library.map(
        (s): GridCell => ({
            kind: "library",
            date: s.date || s.created_at || "",
            scene: s,
        })
    );
    const sdbCells: GridCell[] =
        stashBoxIndex !== null
            ? stashDB.map(
                  (s): GridCell => ({
                      kind: "stashdb",
                      date: s.releaseDate ?? "",
                      scene: s,
                      stashBoxIndex,
                  })
              )
            : [];

    if (sort === "recent") {
        return [...libCells, ...sdbCells].sort((a, b) =>
            b.date.localeCompare(a.date)
        );
    }
    return [...libCells, ...sdbCells];
}

// StashDB-only tile: cover + release date + "StashDB" badge, tap
// opens the AddSceneModal. Mirrors the library tile layout but with
// no preview WebM (StashDB doesn't host preview clips).
function StashDBTile({
    scene,
    onPick,
}: {
    scene: StashDBScene;
    onPick: () => void;
}) {
    const sceneTitle = scene.title?.trim() || "";
    return (
        <li className="binge-profile-scene-cell is-landscape-thumb">
            <button
                type="button"
                className="binge-profile-scene-card"
                onClick={onPick}
                title={sceneTitle || `StashDB scene ${scene.id}`}
            >
                <span
                    className="binge-profile-scene-poster"
                    style={
                        scene.coverUrl
                            ? {
                                  backgroundImage: `url(${scene.coverUrl})`,
                              }
                            : undefined
                    }
                />
                <span className="binge-profile-scene-stashdb-badge">
                    StashDB
                </span>
                <span className="binge-profile-scene-hover">
                    <span className="binge-profile-scene-hover-stats">
                        {scene.releaseDate && (
                            <span className="binge-profile-scene-stat">
                                {scene.releaseDate}
                            </span>
                        )}
                    </span>
                    {sceneTitle && (
                        <span className="binge-profile-scene-title">
                            {sceneTitle}
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}

// Per-card: own video ref, own hover state. Plays preview WebM on
// mouseenter/focus and pauses on leave/blur. preload="none" + lazy src
// assignment keeps cost flat — no bytes fetched until a card is actually
// hovered. Scenes without a preview clip (paths.preview === null) still
// render fine, just without the playback affordance.
function SceneTile({
    scene,
    sort,
    onPick,
}: {
    scene: PerformerSceneCard;
    sort: PerformerSceneSort;
    onPick: () => void;
}) {
    const file = scene.files?.[0];
    const duration = file?.duration ?? null;
    const isLandscapeThumb =
        !!file && file.width > 0 && file.height > 0 && file.width > file.height;
    const oCount = scene.o_counter ?? 0;
    const viewCount = scene.play_count ?? 0;
    const sceneTitle = scene.title?.trim() || "";
    const previewUrl = useDemoMode() ? null : scene.paths.preview;
    // Persistent corner badge showing the stat that matches the active
    // sort (à la TikTok's view-count overlay). Hidden on hover, where the
    // full stat row takes over.
    const badge = sortStatBadge(scene, sort, oCount, viewCount);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const srcArmedRef = useRef(false);

    const handleEnter = () => {
        const v = videoRef.current;
        if (!v || !previewUrl) return;
        // First hover: assign src so the browser starts fetching now,
        // not at mount. Subsequent hovers reuse the cached resource.
        if (!srcArmedRef.current) {
            v.src = previewUrl;
            srcArmedRef.current = true;
        }
        v.currentTime = 0;
        void v.play().catch(() => {
            /* autoplay blocked → fine, poster stays */
        });
    };

    const handleLeave = () => {
        const v = videoRef.current;
        if (!v) return;
        v.pause();
        // Resetting currentTime makes the next hover start from frame 0
        // — same affordance every time, no stale mid-clip frame on re-enter.
        v.currentTime = 0;
    };

    return (
        <li
            className={
                "binge-profile-scene-cell" +
                (isLandscapeThumb ? " is-landscape-thumb" : "")
            }
        >
            <button
                type="button"
                className="binge-profile-scene-card"
                onClick={onPick}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                onFocus={handleEnter}
                onBlur={handleLeave}
                title={sceneTitle || `Scene ${scene.id}`}
            >
                <span
                    className="binge-profile-scene-poster"
                    style={{
                        backgroundImage: `url(${scene.paths.screenshot})`,
                    }}
                />
                {previewUrl && (
                    <video
                        ref={videoRef}
                        className="binge-profile-scene-preview"
                        muted
                        loop
                        playsInline
                        preload="none"
                        aria-hidden="true"
                    />
                )}
                {badge && (
                    <span className="binge-profile-scene-badge">
                        {badge.icon}
                        {badge.text}
                    </span>
                )}
                <span className="binge-profile-scene-hover">
                    <span className="binge-profile-scene-hover-stats">
                        {duration != null && (
                            <span className="binge-profile-scene-stat">
                                {formatDuration(duration)}
                            </span>
                        )}
                        <span className="binge-profile-scene-stat">
                            <ViewIcon />
                            {compactCount(viewCount)}
                        </span>
                        <span className="binge-profile-scene-stat is-o">
                            <OIcon />
                            {compactCount(oCount)}
                        </span>
                    </span>
                    {sceneTitle && (
                        <span className="binge-profile-scene-title">
                            {sceneTitle}
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}

// Resolve the per-tile badge (icon + text) for the active sort. Returns
// null when the relevant value is missing (e.g. unrated, no views, no
// date) so empty badges don't render.
function sortStatBadge(
    scene: PerformerSceneCard,
    sort: PerformerSceneSort,
    oCount: number,
    viewCount: number
): { icon: React.ReactNode; text: string } | null {
    switch (sort) {
        case "views":
            return viewCount > 0
                ? { icon: <ViewIcon />, text: compactCount(viewCount) }
                : null;
        case "orgasms":
            return oCount > 0
                ? { icon: <OIcon />, text: compactCount(oCount) }
                : null;
        case "rating":
            return scene.rating100 != null
                ? {
                      icon: <StarIcon />,
                      text: formatRating10(scene.rating100),
                  }
                : null;
        case "added": {
            const t = compactMonthYear(scene.created_at);
            return t ? { icon: <CalendarIcon />, text: t } : null;
        }
        case "recent":
        default: {
            const t = compactMonthYear(scene.date || scene.created_at);
            return t ? { icon: <CalendarIcon />, text: t } : null;
        }
    }
}

// "Jun 2026" from a "YYYY-MM-DD" or ISO date; falls back to the bare
// year, then null when unparseable.
function compactMonthYear(raw: string | null): string | null {
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})/.exec(raw);
    if (!m) {
        const y = raw.slice(0, 4);
        return /^\d{4}$/.test(y) ? y : null;
    }
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const mi = parseInt(m[2], 10);
    return mi >= 1 && mi <= 12 ? `${months[mi - 1]} ${m[1]}` : m[1];
}

// 0–100 rating → "8.4" out of 10 (drops a trailing .0).
function formatRating10(r: number): string {
    const v = r / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatDuration(seconds: number): string {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

function pad(n: number): string {
    return n.toString().padStart(2, "0");
}

// Short-form counts: 1.2k for thousands, 1.4M for millions. Plain digits
// up to 999 so single-tap counters still read precisely.
function compactCount(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n < 1000) return String(n);
    if (n < 10_000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
    if (n < 10_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
    return `${Math.round(n / 1_000_000)}M`;
}

function ViewIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 5c-5 0-9.27 3.11-11 7.5 1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>
    );
}

function OIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    );
}

function StarIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 17.27l5.18 3.13-1.37-5.89 4.56-3.95-6.01-.51L12 4.5 9.64 10.05l-6.01.51 4.56 3.95-1.37 5.89z" />
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
    );
}
