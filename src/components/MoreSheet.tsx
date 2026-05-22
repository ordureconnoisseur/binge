import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSheetClose } from "../hooks/useSheetClose";
import { setAutoScroll, useAutoScroll } from "../home/pluginSettings";

interface MoreSheetProps {
    sceneId: string;
    onClose: () => void;
}

// Action-stack overflow menu. Currently: per-scene "Open in Stash"
// + persistent "Auto-scroll" toggle (saved across all slides).
// Future items slot in as additional rows.
export function MoreSheet({ sceneId, onClose }: MoreSheetProps) {
    const { isExiting, beginClose } = useSheetClose(onClose);
    const autoScroll = useAutoScroll();

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") beginClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [beginClose]);

    const handleOpenInStash = () => {
        window.open(`/scenes/${sceneId}`, "_blank", "noopener,noreferrer");
        beginClose();
    };

    return createPortal(
        <div
            className={
                "binge-sheet-root" + (isExiting ? " is-exiting" : "")
            }
        >
            <div className="binge-sheet-backdrop" onClick={beginClose} />
            <div
                className="binge-sheet binge-more-sheet"
                role="dialog"
                aria-label="More actions"
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <ul className="binge-more-sheet-list">
                    <li>
                        <button
                            type="button"
                            className="binge-more-sheet-row"
                            onClick={() => setAutoScroll(!autoScroll)}
                            aria-pressed={autoScroll}
                        >
                            <span className="binge-more-sheet-row-label">
                                <span>Auto-scroll</span>
                                <small className="binge-more-sheet-row-sub">
                                    advance to next scene when the
                                    current one ends
                                </small>
                            </span>
                            <span
                                className={
                                    "binge-more-sheet-switch" +
                                    (autoScroll ? " is-on" : "")
                                }
                                aria-hidden="true"
                            >
                                <span className="binge-more-sheet-switch-thumb" />
                            </span>
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            className="binge-more-sheet-row"
                            onClick={handleOpenInStash}
                        >
                            <span className="binge-more-sheet-row-label">
                                Open in Stash
                            </span>
                            <ExternalLinkIcon />
                        </button>
                    </li>
                </ul>
            </div>
        </div>,
        document.body
    );
}

function ExternalLinkIcon() {
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
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );
}
