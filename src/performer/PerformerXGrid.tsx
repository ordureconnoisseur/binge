import { useEffect, useState } from "react";
import type { PerformerDetail } from "../api/queries";
import { getXFeed, type XMedia } from "../api/bingeServer";

interface PerformerXGridProps {
    performer: PerformerDetail;
}

type XState =
    | { kind: "loading" }
    | { kind: "ready"; media: XMedia[]; handle: string }
    // "unavailable" = daemon unreachable, cookies unset, or non-200 — we
    // can't tell which apart (fetch collapses them to null), so the copy
    // is deliberately vague.
    | { kind: "unavailable" }
    | { kind: "error"; message: string };

// On-demand X (Twitter) media tab for a performer profile. One fetch on
// open (binge-server caches 15m server-side), no polling. Tapping a cell
// opens the source tweet on x.com — an in-app viewer is a follow-up.
export function PerformerXGrid({ performer }: PerformerXGridProps) {
    const [state, setState] = useState<XState>({ kind: "loading" });

    useEffect(() => {
        let alive = true;
        setState({ kind: "loading" });
        getXFeed(Number(performer.id))
            .then((res) => {
                if (!alive) return;
                if (res === null) {
                    setState({ kind: "unavailable" });
                    return;
                }
                setState({
                    kind: "ready",
                    media: res.media,
                    handle: res.handle,
                });
            })
            .catch((err: Error) => {
                if (!alive) return;
                setState({ kind: "error", message: err.message });
            });
        return () => {
            alive = false;
        };
    }, [performer.id]);

    if (state.kind === "loading") {
        return (
            <section className="binge-profile-photos">
                <div className="binge-status">loading X media…</div>
            </section>
        );
    }
    if (state.kind === "unavailable") {
        return (
            <section className="binge-profile-photos">
                <div className="binge-status">
                    X media unavailable — check binge-server is running and X
                    cookies are set in Settings.
                </div>
            </section>
        );
    }
    if (state.kind === "error") {
        return (
            <section className="binge-profile-photos">
                <div className="binge-status binge-status-error">
                    error: {state.message}
                </div>
            </section>
        );
    }
    if (state.media.length === 0) {
        return (
            <section className="binge-profile-photos">
                <div className="binge-status">no recent X media</div>
            </section>
        );
    }

    return (
        <section className="binge-profile-photos">
            <ul className="binge-profile-photo-grid">
                {state.media.map((m) => (
                    <li
                        key={m.tweetId + ":" + m.mediaUrl}
                        className="binge-profile-photo-cell"
                    >
                        <a
                            className="binge-profile-photo-card binge-x-cell"
                            href={m.tweetUrl || `https://x.com/${state.handle}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={m.text || "View on X"}
                        >
                            {m.kind === "video" ? (
                                <>
                                    <video
                                        className="binge-profile-photo-thumb"
                                        src={m.mediaUrl}
                                        preload="metadata"
                                        muted
                                        playsInline
                                    />
                                    <span
                                        className="binge-x-play-badge"
                                        aria-hidden="true"
                                    >
                                        ▶
                                    </span>
                                </>
                            ) : (
                                <img
                                    className="binge-profile-photo-thumb"
                                    src={m.mediaUrl}
                                    alt={m.text || ""}
                                    loading="lazy"
                                />
                            )}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
