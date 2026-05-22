import { useEffect, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFeed } from "./useFeed";
import { SceneFeedCard } from "./SceneFeedCard";
import { GalleryFeedCard } from "./GalleryFeedCard";

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
    const { state, loadMore, isLoadingMore, hasMore } = useFeed();
    const feedRef = useRef<HTMLElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    const items = state.kind === "ready" ? state.items : [];

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

    // Infinite-scroll trigger. Uses the same IntersectionObserver
    // pattern as before; the sentinel sits AFTER the virtualizer's
    // tall spacer so it lives at the natural end of the content.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        if (state.kind !== "ready") return;
        if (!hasMore) return;
        if (isLoadingMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) loadMore();
                }
            },
            { rootMargin: "600px 0px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [state.kind, hasMore, isLoadingMore, loadMore]);

    if (state.kind === "loading") {
        return (
            <section className="binge-feed binge-feed-loading">
                <div className="binge-feed-empty">loading feed…</div>
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
                    nothing new in the last 30 days.
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
                            <SceneFeedCard item={item} />
                        ) : (
                            <GalleryFeedCard item={item} />
                        )}
                    </div>
                );
            })}

            {/* Sentinel + status row positioned at the end of the
                virtualized region. Absolute so it sits flush with
                whatever totalSize works out to. */}
            <div
                className="binge-feed-tail"
                style={{
                    position: "absolute",
                    top: `${virtualizer.getTotalSize()}px`,
                    left: 0,
                    right: 0,
                }}
            >
                {hasMore && (
                    <div
                        ref={sentinelRef}
                        className="binge-feed-sentinel"
                        aria-hidden="true"
                    >
                        {isLoadingMore ? "loading more…" : ""}
                    </div>
                )}
                {!hasMore && (
                    <div className="binge-feed-empty">
                        you've reached the end · {items.length} items
                    </div>
                )}
            </div>
        </section>
    );
}
