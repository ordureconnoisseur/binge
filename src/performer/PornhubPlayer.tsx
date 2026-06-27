import { useState } from "react";
import { createPortal } from "react-dom";
import {
    pornhubStreamUrl,
    saveToStash,
    type PornhubVideo,
} from "../api/bingeServer";

// Fullscreen inline player for a PornHub video — plays the stream proxy
// (extracted + relayed mp4, no download) and offers a one-tap "Save to
// Stash" (which downloads the full video server-side via yt-dlp).
export function PornhubPlayer({
    video,
    performerId,
    onClose,
}: {
    video: PornhubVideo;
    performerId: string;
    onClose: () => void;
}) {
    const [saveState, setSaveState] = useState<
        "idle" | "saving" | "saved" | "error"
    >("idle");

    const handleSave = async () => {
        if (saveState === "saving" || saveState === "saved") return;
        setSaveState("saving");
        const res = await saveToStash({
            performerStashId: performerId,
            source: "pornhub",
            id: video.id,
            // yt-dlp downloads from the watch page.
            mediaUrl: video.sourceUrl,
            kind: "video",
            sourceUrl: video.sourceUrl,
            text: video.title ?? undefined,
            createdUtc: video.createdUtc || undefined,
        });
        setSaveState(res.ok ? "saved" : "error");
    };

    return createPortal(
        <div
            className="binge-ph-player-root"
            role="dialog"
            aria-label="PornHub video"
            onClick={onClose}
        >
            <div
                className="binge-ph-player-stage"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="binge-ph-player-bar">
                    <span className="binge-ph-player-title">
                        {video.title || "PornHub"}
                    </span>
                    <button
                        type="button"
                        className={
                            "binge-ph-player-save" +
                            (saveState === "saved" ? " is-saved" : "") +
                            (saveState === "error" ? " is-error" : "")
                        }
                        onClick={() => void handleSave()}
                        disabled={
                            saveState === "saving" || saveState === "saved"
                        }
                        title={
                            saveState === "error"
                                ? "Save failed — tap to retry"
                                : "Download into Stash"
                        }
                    >
                        {saveState === "saved"
                            ? "✓ Saved"
                            : saveState === "saving"
                              ? "Saving…"
                              : saveState === "error"
                                ? "Retry"
                                : "Save to Stash"}
                    </button>
                    <button
                        type="button"
                        className="binge-ph-player-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                    className="binge-ph-player-video"
                    src={pornhubStreamUrl(video.id)}
                    controls
                    autoPlay
                    playsInline
                />
            </div>
        </div>,
        document.body
    );
}
