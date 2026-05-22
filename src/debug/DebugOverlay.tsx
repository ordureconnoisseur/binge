import { useEffect, useState } from "react";
import { getGqlStats } from "../api/graphql";
import { useTab } from "../tabs/TabContext";

// Pinned bottom-left diagnostic panel. Polls every 500ms — cheap
// because all queries are direct DOM/JS reads. Only mounted when the
// "Show debug overlay" setting is on; safe to leave compiled in.
//
// Reads:
//   - document.querySelectorAll('video').length  → mounted video count
//   - performance.memory.usedJSHeapSize          → JS heap (Chrome)
//   - getGqlStats()                              → request ring buffer
//   - TabContext: tab, reelMode, tabBarVisible   → app state
//
// What to look for while testing:
//   - Mounted video count should stay ≤ 5 even during fast scroll.
//     If it climbs into double digits, the cleanup isn't firing.
//   - JS heap should plateau, not climb monotonically.
//   - GraphQL avg/max ms tells you if Stash is the bottleneck.

const POLL_MS = 500;

interface ChromePerformance extends Performance {
    memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
}

function readMemoryMB(): { used: number; limit: number } | null {
    const perf = performance as ChromePerformance;
    if (!perf.memory) return null;
    return {
        used: perf.memory.usedJSHeapSize / (1024 * 1024),
        limit: perf.memory.jsHeapSizeLimit / (1024 * 1024),
    };
}

export function DebugOverlay() {
    const { tab, reelMode } = useTab();
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 1), POLL_MS);
        return () => window.clearInterval(id);
    }, []);

    // Read everything fresh on each render (driven by `tick`).
    void tick;
    const videoCount =
        typeof document !== "undefined"
            ? document.querySelectorAll("video").length
            : 0;
    const mem = readMemoryMB();
    const stats = getGqlStats();
    const recent = stats.samples.slice(-5).reverse();

    return (
        <div
            className="binge-debug-overlay"
            role="complementary"
            aria-label="Performance debug overlay"
        >
            <div className="binge-debug-row">
                <span className="binge-debug-label">tab</span>
                <span className="binge-debug-value">
                    {tab} · {reelMode}
                </span>
            </div>
            <div className="binge-debug-row">
                <span className="binge-debug-label">videos</span>
                <span
                    className={
                        "binge-debug-value" +
                        (videoCount > 8 ? " is-warn" : "")
                    }
                >
                    {videoCount}
                </span>
            </div>
            {mem && (
                <div className="binge-debug-row">
                    <span className="binge-debug-label">heap</span>
                    <span
                        className={
                            "binge-debug-value" +
                            (mem.used > 600 ? " is-warn" : "")
                        }
                    >
                        {mem.used.toFixed(0)} / {mem.limit.toFixed(0)} MB
                    </span>
                </div>
            )}
            <div className="binge-debug-row">
                <span className="binge-debug-label">gql</span>
                <span className="binge-debug-value">
                    {stats.totalRequests} req · {stats.inFlight} now ·{" "}
                    {stats.totalFailures} fail
                </span>
            </div>
            <div className="binge-debug-row">
                <span className="binge-debug-label">gql ms</span>
                <span
                    className={
                        "binge-debug-value" +
                        (stats.avgMs > 500 ? " is-warn" : "")
                    }
                >
                    avg {stats.avgMs.toFixed(0)} · max{" "}
                    {stats.maxMs.toFixed(0)}
                </span>
            </div>
            {recent.length > 0 && (
                <div className="binge-debug-recent">
                    <div className="binge-debug-recent-heading">recent</div>
                    {recent.map((s, i) => (
                        <div
                            key={`${s.timestamp}-${i}`}
                            className={
                                "binge-debug-recent-row" +
                                (s.failed ? " is-fail" : "")
                            }
                        >
                            <span className="binge-debug-recent-ms">
                                {s.ms.toFixed(0)}
                            </span>
                            <span className="binge-debug-recent-name">
                                {s.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
