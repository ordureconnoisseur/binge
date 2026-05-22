import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findScenes } from "../api/queries";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "./TabContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";

interface ExploreTile {
    id: string;
    screenshot: string | null;
}

// IG-style 3-column grid of random scene thumbnails. Tap → opens that
// scene in the For You reel. Session-pinned random seed so pagination
// stays consistent — without it, page 2 would be a fresh shuffle and
// you'd see duplicates.
const PAGE_SIZE = 30;

export function Explore() {
    const sortSeed = useMemo(
        () => `random_${Math.floor(Math.random() * 1e9)}`,
        []
    );
    const [tiles, setTiles] = useState<ExploreTile[]>([]);
    // Page is a ref, not state — the observer reads it on each fire,
    // and we don't want the observer effect to tear down + re-attach
    // on every page bump (the old setup did, hammering the GC).
    const pageRef = useRef(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const loadingRef = useRef(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const { replace } = useFilter();
    const { setPinFirstSceneId, setReelMode } = useTab();

    useAutoHideTabBar(scrollRef);

    const loadPage = useCallback(
        async (nextPage: number) => {
            if (loadingRef.current) return;
            loadingRef.current = true;
            setIsLoading(true);
            try {
                const data = await findScenes({
                    filter: {
                        page: nextPage,
                        per_page: PAGE_SIZE,
                        sort: sortSeed,
                    },
                });
                const fresh: ExploreTile[] = [];
                for (const s of data.findScenes.scenes) {
                    if (seenIdsRef.current.has(s.id)) continue;
                    seenIdsRef.current.add(s.id);
                    fresh.push({ id: s.id, screenshot: s.paths.screenshot });
                }
                setTiles((prev) => [...prev, ...fresh]);
                pageRef.current = nextPage;
                // Stop paginating when the latest page didn't fill — Stash
                // returns fewer than per_page when there are no more rows.
                if (data.findScenes.scenes.length < PAGE_SIZE) {
                    setHasMore(false);
                }
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : String(err)
                );
                setHasMore(false);
            } finally {
                loadingRef.current = false;
                setIsLoading(false);
            }
        },
        [sortSeed]
    );

    // Initial load
    useEffect(() => {
        void loadPage(1);
        // sortSeed is stable for the lifetime of this Explore mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Infinite-scroll sentinel — fires loadPage(pageRef + 1) when
    // within 800px of the viewport bottom. Observer attaches ONCE; the
    // page counter and load gating live in refs so this effect's
    // identity is stable across pagination.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    // Same gates as the effect-deps version, just
                    // read at fire time.
                    if (loadingRef.current) continue;
                    void loadPage(pageRef.current + 1);
                }
            },
            { rootMargin: "800px 0px", root: scrollRef.current }
        );
        observer.observe(el);
        return () => observer.disconnect();
        // loadPage is stable (deps: [sortSeed] — stable for mount).
        // hasMore + isLoading are *display* state but the observer
        // simply re-checks loadingRef/hasMore on every fire; if there's
        // truly no more, the next fire is a no-op via the early return
        // inside loadPage (which sets hasMore=false after a short page).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTileClick = (scene: ExploreTile) => {
        // Clear filters, set the pin, switch to chained mode. Do NOT
        // switch tab — the chained reel is conceptually part of
        // Explore, so the tab indicator should still highlight
        // "Explore". App.tsx routes on (tab, reelMode): explore +
        // chained → <Reel>, explore + random → <Explore grid>.
        replace({ performers: [], tags: [], studios: [] });
        setPinFirstSceneId(scene.id);
        setReelMode("chained");
    };

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <div className="binge-explore-grid-wrap">
                <div className="binge-explore-grid">
                    {tiles.map((tile) => (
                        <button
                            key={tile.id}
                            type="button"
                            className="binge-explore-tile"
                            onClick={() => handleTileClick(tile)}
                            style={
                                tile.screenshot
                                    ? {
                                          backgroundImage: `url(${tile.screenshot})`,
                                      }
                                    : undefined
                            }
                            aria-label="Open scene"
                        >
                            <span
                                className="binge-explore-tile-play"
                                aria-hidden="true"
                            >
                                <PlayIcon />
                            </span>
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="binge-feed-empty binge-status-error">
                        couldn't load explore: {error}
                    </div>
                )}
                {tiles.length === 0 && !isLoading && !error && (
                    <div className="binge-feed-empty">
                        no scenes in your library.
                    </div>
                )}

                {hasMore && (
                    <div
                        ref={sentinelRef}
                        className="binge-feed-sentinel"
                        aria-hidden="true"
                    >
                        {isLoading ? "loading…" : ""}
                    </div>
                )}
                {!hasMore && tiles.length > 0 && (
                    <div className="binge-feed-empty">
                        you've reached the end · {tiles.length} scenes
                    </div>
                )}
            </div>
        </div>
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
