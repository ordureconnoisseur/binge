import { useRef } from "react";
import { StoriesRow } from "../home/StoriesRow";
import { Feed } from "../home/Feed";
import { FeedFilterMenu } from "../home/FeedFilterMenu";
import { useSharedStories } from "../home/StoriesContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";

// Home is the landing surface — IG-style stories at the top, vertical
// scene-feed below. Reddit posts are merged into the per-performer
// stories bubbles alongside library + stashdb scenes.
//
// useStories is lifted to this component so the manual-refresh button
// (which lives in the page-title row, away from the bubble strip) can
// reach the same refresh callback the stories internally use.
export function Home() {
    const scrollRef = useRef<HTMLDivElement>(null);
    useAutoHideTabBar(scrollRef);
    const stories = useSharedStories();

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <div className="binge-tab-inner">
                <div className="binge-tab-title-row">
                    <div className="binge-tab-title-group">
                        <h1 className="binge-tab-title">Home</h1>
                        <FeedFilterMenu />
                    </div>
                    <button
                        type="button"
                        className={
                            "binge-stories-refresh" +
                            (stories.refreshing ? " is-refreshing" : "")
                        }
                        onClick={stories.refresh}
                        disabled={stories.refreshing}
                        aria-label="Refresh stories"
                        title="Refresh stories"
                    >
                        <RefreshIcon />
                    </button>
                </div>
                <StoriesRow stories={stories} />
                <Feed scrollContainerRef={scrollRef} />
            </div>
        </div>
    );
}

function RefreshIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083L3 16M3 12C3 7.02944 7.02944 3 12 3C14.3051 3 16.4077 3.86656 18 5.29168L21 8M3 21V16M3 16H8M21 3V8M21 8H16" />
        </svg>
    );
}
