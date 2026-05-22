import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findScenes, findRecentlyLikedTags } from "../api/queries";
import { getTopInteractedTags, type TagScore } from "../api/interactedTags";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "./TabContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";

interface ExploreTile {
    id: string;
    screenshot: string | null;
}

// IG-style 3-column grid with a search bar + horizontal tag-chip row
// pinned at the top. Tap a tile → opens the scene in the For You reel
// in chained mode. Session-pinned random seed so pagination stays
// consistent — without it, page 2 would be a fresh shuffle and you'd
// see duplicates.
const PAGE_SIZE = 30;
// More chips than fit in a single row on most screens — they wrap, so
// extras fill out the rows below instead of being cropped.
const MAX_CHIPS = 25;
// Debounce the search input so each keystroke doesn't fire a Stash
// query. 280ms is the sweet spot — fast enough to feel reactive but
// long enough that a typed word coalesces into one request.
const SEARCH_DEBOUNCE_MS = 280;

export function Explore() {
    const sortSeed = useMemo(
        () => `random_${Math.floor(Math.random() * 1e9)}`,
        []
    );
    const [tiles, setTiles] = useState<ExploreTile[]>([]);
    // Page is a ref, not state — the observer reads it on each fire,
    // and we don't want the observer effect to tear down + re-attach
    // on every page bump.
    const pageRef = useRef(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const loadingRef = useRef(false);

    // Active chip: null = "For you" (random), otherwise the tag to
    // filter on. Changing this resets pagination + the seen set so
    // the user sees a fresh grid for the new filter.
    const [activeTag, setActiveTag] = useState<TagScore | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    // Chevron visibility — true when there's content to scroll into
    // on each side. Hidden chevrons keep their gutter so chips never
    // jump when the user scrolls past the edges.
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [topTags, setTopTags] = useState<TagScore[]>([]);
    // Server-derived fallback: tags from the user's most-recently-
    // liked scenes (Stash's o_counter + last_o_at). Used when the
    // local interaction ring hasn't accumulated enough data for a
    // useful personal chip strip — e.g. fresh install, or another
    // browser where localStorage is empty but Stash's like history
    // still represents the user's taste.
    const [fallbackTags, setFallbackTags] = useState<TagScore[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const chipScrollerRef = useRef<HTMLDivElement>(null);
    const { replace } = useFilter();
    const { setPinFirstSceneId, setReelMode } = useTab();

    useAutoHideTabBar(scrollRef);

    // Top chips refresh on mount + whenever the user comes back to
    // Explore (they may have liked things in between visits). A
    // `storage` listener also catches cross-tab updates.
    useEffect(() => {
        setTopTags(getTopInteractedTags(MAX_CHIPS));
        const onStorage = (e: StorageEvent) => {
            if (e.key === "binge.interactedTags") {
                setTopTags(getTopInteractedTags(MAX_CHIPS));
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // Fallback chip data: tags from the user's recently liked scenes.
    // Sampling 30 scenes is plenty for a top-10 chip strip — the
    // accuracy stabilises after ~15 source scenes anyway. Failures
    // are silent; chip row just shows "For you" alone if Stash errors
    // or the user has no liked scenes yet.
    useEffect(() => {
        let alive = true;
        findRecentlyLikedTags(30, MAX_CHIPS)
            .then((tags) => {
                if (!alive) return;
                setFallbackTags(
                    tags.map((t) => ({
                        tagId: t.id,
                        tagName: t.name,
                        score: 0,
                        lastSeenAt: 0,
                    }))
                );
            })
            .catch(() => {
                /* leave empty; chip row still shows For you + any personal */
            });
        return () => {
            alive = false;
        };
    }, []);

    // Debounce header-input → search-query. Empty input is treated as
    // immediately committed (no debounce) so clearing feels snappy.
    useEffect(() => {
        if (searchInput === "") {
            setSearchQuery("");
            return;
        }
        const t = window.setTimeout(() => {
            setSearchQuery(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [searchInput]);

    // Choose which list to render in the chip row: personal first,
    // library fallback only when personal is too small to be useful.
    const chipsToRender =
        topTags.length >= 3 ? topTags : fallbackTags;

    // Track scroll position so the chevrons fade in/out. Refreshed on
    // scroll, on resize, and when the chip set changes (so the
    // right-chevron appears as soon as data lands).
    useEffect(() => {
        const el = chipScrollerRef.current;
        if (!el) return;
        const update = () => {
            const max = el.scrollWidth - el.clientWidth;
            setCanScrollLeft(el.scrollLeft > 4);
            setCanScrollRight(el.scrollLeft < max - 4);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [chipsToRender.length]);

    const scrollChips = (delta: number) => {
        chipScrollerRef.current?.scrollBy({
            left: delta,
            behavior: "smooth",
        });
    };

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
                        ...(searchQuery ? { q: searchQuery } : {}),
                    },
                    scene_filter: activeTag
                        ? {
                              tags: {
                                  value: [activeTag.tagId],
                                  modifier: "INCLUDES",
                              },
                          }
                        : undefined,
                });
                const fresh: ExploreTile[] = [];
                for (const s of data.findScenes.scenes) {
                    if (seenIdsRef.current.has(s.id)) continue;
                    seenIdsRef.current.add(s.id);
                    fresh.push({ id: s.id, screenshot: s.paths.screenshot });
                }
                setTiles((prev) =>
                    nextPage === 1 ? fresh : [...prev, ...fresh]
                );
                pageRef.current = nextPage;
                if (data.findScenes.scenes.length < PAGE_SIZE) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
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
        [sortSeed, activeTag, searchQuery]
    );

    // Reset + reload when filter (tag or search) changes. Wiping
    // seenIds + pageRef + tiles in one place means the grid never
    // shows stale rows from the prior filter.
    useEffect(() => {
        seenIdsRef.current.clear();
        pageRef.current = 0;
        setTiles([]);
        setError(null);
        setHasMore(true);
        void loadPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTag?.tagId, searchQuery]);

    // Infinite-scroll sentinel — same attach-once pattern as before.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    if (loadingRef.current) continue;
                    void loadPage(pageRef.current + 1);
                }
            },
            { rootMargin: "800px 0px", root: scrollRef.current }
        );
        observer.observe(el);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTileClick = (scene: ExploreTile) => {
        // Tap a tile → drop into chained reel. App.tsx routes on
        // (tab, reelMode): explore + chained → <Reel>, explore +
        // random → <Explore grid>, so we stay on the Explore tab
        // visually while showing reel content.
        replace({ performers: [], tags: [], studios: [] });
        setPinFirstSceneId(scene.id);
        setReelMode("chained");
    };

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <header className="binge-explore-header">
                <div className="binge-explore-search-row">
                    <span
                        className="binge-explore-search-icon"
                        aria-hidden="true"
                    >
                        <SearchIcon />
                    </span>
                    <input
                        type="search"
                        className="binge-explore-search"
                        placeholder="Search scenes"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        aria-label="Search scenes"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                </div>
                <div className="binge-explore-chips-row">
                    <button
                        type="button"
                        className={
                            "binge-explore-chips-chevron" +
                            (canScrollLeft ? "" : " is-hidden")
                        }
                        onClick={() => scrollChips(-280)}
                        aria-label="Scroll tags left"
                        tabIndex={canScrollLeft ? 0 : -1}
                    >
                        <ChevronLeft />
                    </button>
                    <div
                        className="binge-explore-chips"
                        ref={chipScrollerRef}
                    >
                        <button
                            type="button"
                            className={
                                "binge-explore-chip" +
                                (activeTag === null ? " is-active" : "")
                            }
                            onClick={() => setActiveTag(null)}
                        >
                            For you
                        </button>
                        {chipsToRender.map((t) => (
                            <button
                                type="button"
                                key={t.tagId}
                                className={
                                    "binge-explore-chip" +
                                    (activeTag?.tagId === t.tagId
                                        ? " is-active"
                                        : "")
                                }
                                onClick={() => setActiveTag(t)}
                                title={t.tagName}
                            >
                                {t.tagName}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className={
                            "binge-explore-chips-chevron" +
                            (canScrollRight ? "" : " is-hidden")
                        }
                        onClick={() => scrollChips(280)}
                        aria-label="Scroll tags right"
                        tabIndex={canScrollRight ? 0 : -1}
                    >
                        <ChevronRight />
                    </button>
                </div>
            </header>

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
                        {searchQuery || activeTag
                            ? "no scenes match this filter."
                            : "no scenes in your library."}
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

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 18l-6-6 6-6" />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
        </svg>
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
            <path d="M9 7L18 12L9 17Z" />
        </svg>
    );
}

