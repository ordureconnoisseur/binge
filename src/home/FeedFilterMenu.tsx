import { useEffect, useRef, useState } from "react";
import {
    ALL_FEED_CATEGORIES,
    setHiddenFeedCategories,
    useHiddenFeedCategories,
    type FeedCategory,
} from "./pluginSettings";

// Small funnel button next to the "Home" title. Opens a popover of
// per-category visibility toggles for the Home feed. State is stored
// in localStorage (binge.feedHidden) so it persists and the Feed
// reacts live via useHiddenFeedCategories.
const LABELS: Record<FeedCategory, string> = {
    discover: "Discover",
    trending: "Trending",
    posts: "Posts",
    reposts: "Reposts",
};

export function FeedFilterMenu() {
    const hidden = useHiddenFeedCategories();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (
                rootRef.current &&
                !rootRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggle = (cat: FeedCategory) => {
        const next = new Set(hidden);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        setHiddenFeedCategories(next);
    };

    const anyHidden = hidden.size > 0;

    return (
        <div className="binge-feed-filter" ref={rootRef}>
            <button
                type="button"
                className={
                    "binge-feed-filter-btn" +
                    (anyHidden ? " is-active" : "")
                }
                onClick={() => setOpen((o) => !o)}
                aria-label="Filter feed"
                aria-expanded={open}
                title="Filter feed"
            >
                <FilterIcon />
                {anyHidden && (
                    <span
                        className="binge-feed-filter-dot"
                        aria-hidden="true"
                    />
                )}
            </button>
            {open && (
                <div className="binge-feed-filter-menu" role="menu">
                    <div className="binge-feed-filter-heading">
                        Show in feed
                    </div>
                    {ALL_FEED_CATEGORIES.map((cat) => {
                        const shown = !hidden.has(cat);
                        return (
                            <button
                                key={cat}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={shown}
                                className={
                                    "binge-feed-filter-item" +
                                    (shown ? " is-on" : "")
                                }
                                onClick={() => toggle(cat)}
                            >
                                <span className="binge-feed-filter-check">
                                    {shown && <CheckIcon />}
                                </span>
                                {LABELS[cat]}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function FilterIcon() {
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
            <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5 13l4 4L19 7" />
        </svg>
    );
}
