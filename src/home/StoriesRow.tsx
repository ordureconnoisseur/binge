import { useEffect, useRef, useState } from "react";
import { type Story as StoryData, type StoriesResult } from "./useStories";
import { Story } from "./Story";
import { useStoryViewer } from "./StoryViewerContext";

// Horizontal scroller of performers in your library with new scenes.
// Tap → opens the IG-style StoryViewer at that performer; the viewer's
// "Watch full scene" CTA is what jumps into the reel.
//
// Stories data + the refresh callback are owned by Home.tsx so the
// refresh button can sit in the page-title row instead of the scroller.
export function StoriesRow({ stories }: { stories: StoriesResult }) {
    const { state, refreshing } = stories;
    const storyViewer = useStoryViewer();
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Track scroll position so we know which chevrons to show. Update
    // on scroll + on content/size changes (new stories arriving,
    // viewport resizes).
    useEffect(() => {
        const el = scrollerRef.current;
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
    }, [state.kind]);

    const scrollByAmount = (delta: number) => {
        scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
    };

    const handleClick = (s: StoryData) => {
        if (state.kind !== "ready") return;
        const idx = state.stories.findIndex(
            (x) => x.performerId === s.performerId
        );
        storyViewer.open(state.stories, idx >= 0 ? idx : 0);
    };

    if (state.kind === "loading" && !refreshing) {
        return (
            <section className="binge-stories-row binge-stories-row-loading">
                <div className="binge-stories-empty">loading stories…</div>
            </section>
        );
    }
    if (state.kind === "error") {
        return (
            <section className="binge-stories-row">
                <div className="binge-stories-empty binge-status-error">
                    couldn't load stories: {state.message}
                </div>
            </section>
        );
    }

    const list = state.kind === "ready" ? state.stories : [];

    return (
        <section
            className="binge-stories-row"
            aria-label="Performers with new scenes"
        >
            {list.length === 0 ? (
                <div className="binge-stories-empty">
                    no new scenes from your favourites in the last 30 days.
                </div>
            ) : (
                <>
                    {canScrollLeft && (
                        <button
                            type="button"
                            className="binge-stories-chevron binge-stories-chevron-left"
                            onClick={() => scrollByAmount(-280)}
                            aria-label="Scroll left"
                        >
                            <ChevronLeft />
                        </button>
                    )}
                    <div
                        className="binge-stories-scroller"
                        ref={scrollerRef}
                    >
                        {list.map((s) => (
                            <Story
                                key={s.performerId}
                                story={s}
                                onClick={handleClick}
                            />
                        ))}
                    </div>
                    {canScrollRight && (
                        <button
                            type="button"
                            className="binge-stories-chevron binge-stories-chevron-right"
                            onClick={() => scrollByAmount(280)}
                            aria-label="Scroll right"
                        >
                            <ChevronRight />
                        </button>
                    )}
                </>
            )}
        </section>
    );
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
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
            width="18"
            height="18"
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
