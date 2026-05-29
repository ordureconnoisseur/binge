import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFeed, type FeedItem } from "./useFeed";
import { SceneFeedCard } from "./SceneFeedCard";
import { GalleryFeedCard } from "./GalleryFeedCard";
import { DiscoveryFeedCard } from "./DiscoveryFeedCard";
import { invalidateStashDBCache } from "../api/stashdb";
import { BingeLoading } from "../components/BingeLoading";
import { PackFeedCard } from "./PackFeedCard";
import {
    useHiddenFeedCategories,
    type FeedCategory,
} from "./pluginSettings";

// Maps a feed item to the filter category the Home filter menu
// controls. Galleries return null — they're governed by the separate
// "Show galleries" setting, not this filter.
function feedCategory(it: FeedItem): FeedCategory | null {
    switch (it.kind) {
        case "discovery":
            return it.source === "trending" ? "trending" : "discover";
        case "scene":
        case "pack":
            return it.isRepost ? "reposts" : "posts";
        default:
            return null;
    }
}

interface FeedProps {
    // The scrollable container this feed lives inside — usually
    // <Home>'s `.binge-tab-scroll`. The virtualizer needs to attach
    // to the real scroll element, not the feed itself.
    scrollContainerRef: RefObject<HTMLDivElement | null>;
}

// Vertical mixed-media post feed for the Home tab. Sits below the
// StoriesRow inside the Home scroll container; shares recent-scenes /
// recent-galleries fetches via recentScenesCache.
//
// Virtualized via @tanstack/react-virtual — only the cards near the
// viewport are mounted. Avoids 50+ <video> elements + carousels piling
// up in the DOM as the user infinite-scrolls.
export function Feed({ scrollContainerRef }: FeedProps) {
    const { state } = useFeed();
    const hidden = useHiddenFeedCategories();
    const feedRef = useRef<HTMLElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    const rawItems = state.kind === "ready" ? state.items : [];
    const items = useMemo(
        () =>
            rawItems.filter((it) => {
                const cat = feedCategory(it);
                return cat === null || !hidden.has(cat);
            }),
        [rawItems, hidden]
    );

    // Date-ordered list of every scene id in the home feed (skips
    // gallery + discovery rows). Passed to SceneFeedCard so the
    // "Watch full scene" CTA can drop the user into the reel
    // pre-populated with the home timeline, starting at the tapped
    // scene — same UX as the iOS port. Memoized so the array stays
    // referentially stable and doesn't bust every card's props.
    const feedSceneIds = useMemo(
        () =>
            items
                .filter((it): it is Extract<typeof it, { kind: "scene" }> =>
                    it.kind === "scene"
                )
                .map((it) => it.sceneId),
        [items]
    );

    // The feed isn't at the top of its scroll container — there's a
    // page title and the stories row above it. Tell the virtualizer
    // about that offset so it computes visibility correctly. Re-measure
    // on resize because the stories row height settles as performer
    // avatars finish loading.
    useEffect(() => {
        const scrollEl = scrollContainerRef.current;
        const feedEl = feedRef.current;
        if (!scrollEl || !feedEl) return;

        const updateMargin = () => {
            const scrollRect = scrollEl.getBoundingClientRect();
            const feedRect = feedEl.getBoundingClientRect();
            // feedRect.top is viewport-relative; convert to
            // scroll-content-relative by adding the container's current
            // scrollTop. scrollRect.top accounts for the container's
            // own viewport position (e.g., header above).
            const next = feedRect.top - scrollRect.top + scrollEl.scrollTop;
            setScrollMargin(next);
        };

        updateMargin();
        const ro = new ResizeObserver(updateMargin);
        ro.observe(scrollEl);
        ro.observe(feedEl);
        return () => ro.disconnect();
    }, [scrollContainerRef]);

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollContainerRef.current,
        // Initial guess — measureElement refines each card's real
        // height as it mounts. Wildly off estimates lead to scrollbar
        // jumps during initial layout; 720px is a reasonable middle
        // between a short scene card (~520px) and a tall gallery
        // card with carousel (~900px).
        estimateSize: () => 720,
        overscan: 2,
        scrollMargin,
        getItemKey: (i) => items[i]?.key ?? i,
    });

    if (state.kind === "loading") {
        return (
            <section className="binge-feed binge-feed-loading">
                <BingeLoading minHeight="60vh" />
            </section>
        );
    }
    if (state.kind === "error") {
        return (
            <section className="binge-feed">
                <div className="binge-feed-empty binge-status-error">
                    couldn't load feed: {state.message}
                </div>
            </section>
        );
    }
    if (items.length === 0) {
        return (
            <section className="binge-feed">
                <div className="binge-feed-empty">
                    {rawItems.length > 0
                        ? "everything's filtered out — adjust the filter."
                        : "nothing new in your recent window."}
                </div>
            </section>
        );
    }

    return (
        <section
            className="binge-feed"
            aria-label="New scenes and galleries"
            ref={feedRef}
            style={{
                position: "relative",
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
            }}
        >
            {virtualizer.getVirtualItems().map((vi) => {
                const item = items[vi.index];
                if (!item) return null;
                return (
                    <div
                        key={vi.key}
                        data-index={vi.index}
                        ref={virtualizer.measureElement}
                        className="binge-feed-card-wrapper"
                        style={{
                            // Position the absolute child relative to
                            // the virtual list. scrollMargin already
                            // tells the virtualizer about the offset
                            // ABOVE the list, so vi.start is correctly
                            // 0-based against this container.
                            transform: `translate(-50%, ${vi.start}px)`,
                        }}
                    >
                        {item.kind === "scene" ? (
                            <SceneFeedCard
                                item={item}
                                feedSceneIds={feedSceneIds}
                            />
                        ) : item.kind === "gallery" ? (
                            <GalleryFeedCard item={item} />
                        ) : item.kind === "pack" ? (
                            <PackFeedCard item={item} />
                        ) : (
                            <DiscoveryFeedCard
                                item={item}
                                onFollowed={() => {
                                    // Drop the StashDB cache so the
                                    // next useFeed refetch picks the
                                    // performer up as a library
                                    // performer and stops surfacing
                                    // them as a discovery suggestion.
                                    invalidateStashDBCache();
                                }}
                            />
                        )}
                    </div>
                );
            })}

            {/* End-of-feed marker positioned at the end of the
                virtualized region. */}
            <div
                className="binge-feed-tail"
                style={{
                    position: "absolute",
                    top: `${virtualizer.getTotalSize()}px`,
                    left: 0,
                    right: 0,
                }}
            >
                <div className="binge-feed-empty">
                    you've reached the end · {items.length} items
                </div>
            </div>
        </section>
    );
}
