import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useSheetClose } from "../hooks/useSheetClose";
import { useHasScribe } from "../plugins/PluginContext";
import { useScribeModal } from "../scribe/ScribeContext";

interface PerformerMoreSheetProps {
    performerId: string;
    onRefresh: () => void;
    onClose: () => void;
}

// Overflow menu for the performer profile (the ⋯ in the top-right
// of the header). Two actions today: refresh the cached performer
// data and open the performer's native Stash page. Mirrors the
// SceneSlide MoreSheet pattern; kept separate so the row set can
// evolve independently from the per-scene one.
export function PerformerMoreSheet({
    performerId,
    onRefresh,
    onClose,
}: PerformerMoreSheetProps) {
    const { isExiting, beginClose } = useSheetClose(onClose);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") beginClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [beginClose]);

    const hasScribe = useHasScribe();
    const scribeModal = useScribeModal();

    const handleRefresh = () => {
        onRefresh();
        beginClose();
    };
    const handleWriteReview = () => {
        scribeModal.openPerformer(performerId);
        beginClose();
    };
    const handleOpenInStash = () => {
        window.open(
            `/performers/${performerId}`,
            "_blank",
            "noopener,noreferrer"
        );
        beginClose();
    };

    return createPortal(
        <div
            className={
                "binge-sheet-root binge-sheet-root-top" +
                (isExiting ? " is-exiting" : "")
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
                    {hasScribe && (
                        <li>
                            <button
                                type="button"
                                className="binge-more-sheet-row"
                                onClick={handleWriteReview}
                            >
                                <span className="binge-more-sheet-row-label">
                                    Write review
                                </span>
                                <CommentIcon />
                            </button>
                        </li>
                    )}
                    <li>
                        <button
                            type="button"
                            className="binge-more-sheet-row"
                            onClick={handleRefresh}
                        >
                            <span className="binge-more-sheet-row-label">
                                Refresh
                            </span>
                            <RefreshIcon />
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

function CommentIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M 20.656 17.008 a 9.993 9.993 0 1 0 -3.59 3.615 L 22 22 Z" />
        </svg>
    );
}

function RefreshIcon() {
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
            <path d="M21 12C21 16.97 16.97 21 12 21C9.69 21 7.59 20.13 6 18.71L3 16M3 12C3 7.03 7.03 3 12 3C14.31 3 16.41 3.87 18 5.29L21 8M3 21V16M3 16H8M21 3V8M21 8H16" />
        </svg>
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
