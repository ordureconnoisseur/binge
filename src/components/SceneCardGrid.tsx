import { useEffect, useRef, useState } from "react";
import type { PerformerSceneCard } from "../api/queries";

// Generic paginated 3-column scene grid. The performer profile and the
// saved-collection detail view both use this — they only differ in
// their fetcher (scenes by performer vs scenes by tag) and what
// happens when a tile is tapped.
//
// `fetcher` returns one page at a time. `onPick` fires when a tile is
// tapped — the caller decides what to do (typically: configure the
// reel filter, pin this scene id, switch to For You).

const DEFAULT_PAGE_SIZE = 24;
// Distance from grid bottom that triggers the next page load.
const NEAR_BOTTOM_PX = 600;

export interface SceneCardGridProps {
    fetcher: (
        page: number,
        perPage: number
    ) => Promise<{ count: number; scenes: PerformerSceneCard[] }>;
    onPick: (scene: PerformerSceneCard) => void;
    // Reset fetched state when this changes (e.g. switching to a
    // different collection). Anything stably-stringifiable works.
    resetKey?: string;
    pageSize?: number;
    heading?: string;
    emptyMessage?: string;
}

export function SceneCardGrid({
    fetcher,
    onPick,
    resetKey,
    pageSize = DEFAULT_PAGE_SIZE,
    heading,
    emptyMessage = "no scenes",
}: SceneCardGridProps) {
    const [scenes, setScenes] = useState<PerformerSceneCard[]>([]);
    const [count, setCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset when the resetKey changes (different collection/performer).
    useEffect(() => {
        setScenes([]);
        setCount(null);
        setPage(1);
        setError(null);
    }, [resetKey]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        fetcher(page, pageSize)
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
        // fetcher intentionally NOT a dep — callers will recreate it on
        // every render; we rely on `resetKey` for cache-busting.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey, page, pageSize]);

    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        if (count == null) return;
        if (scenes.length >= count) return;
        if (loading) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setPage((p) => p + 1);
                }
            },
            { rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px` }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [count, scenes.length, loading]);

    return (
        <div className="binge-explore-grid-wrap">
            {heading && (
                <h2 className="binge-profile-scenes-heading">
                    {heading}
                    {count != null ? ` (${count})` : ""}
                </h2>
            )}
            {error && (
                <div className="binge-status binge-status-error">
                    error: {error}
                </div>
            )}
            {scenes.length === 0 && loading && (
                <div className="binge-status">loading…</div>
            )}
            {scenes.length === 0 && !loading && !error && (
                <div className="binge-status">{emptyMessage}</div>
            )}
            {scenes.length > 0 && (
                <div className="binge-explore-grid">
                    {scenes.map((s) => (
                        <ExploreStyleTile
                            key={s.id}
                            scene={s}
                            onPick={() => onPick(s)}
                        />
                    ))}
                </div>
            )}
            <div ref={sentinelRef} aria-hidden="true" />
            {loading && scenes.length > 0 && (
                <div className="binge-status">loading more…</div>
            )}
        </div>
    );
}

// Square Explore-style tile. Static screenshot poster (no hover-preview
// to keep the grid feeling like a thumbnail board, not a hover-rich
// catalog). Play glyph in the top-right corner matches Explore's tile.
function ExploreStyleTile({
    scene,
    onPick,
}: {
    scene: PerformerSceneCard;
    onPick: () => void;
}) {
    const sceneTitle = scene.title?.trim() || `Scene ${scene.id}`;
    return (
        <button
            type="button"
            className="binge-explore-tile"
            onClick={onPick}
            title={sceneTitle}
            aria-label={sceneTitle}
            style={
                scene.paths.screenshot
                    ? {
                          backgroundImage: `url(${scene.paths.screenshot})`,
                      }
                    : undefined
            }
        >
            <span className="binge-explore-tile-play" aria-hidden="true">
                <PlayIcon />
            </span>
        </button>
    );
}

function PlayIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
        >
            <path d="M8 5v14l11-7z" />
        </svg>
    );
}
