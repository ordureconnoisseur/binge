import { useEffect, useRef, useState } from "react";
import {
    useHasAdvancedRating,
    useHasMultiview,
    useHasScribe,
} from "../plugins/PluginContext";
import { SaveSheet } from "./SaveSheet";

interface ActionStackProps {
    // ── Heart / O-counter ─────────────────────────────────────────
    oCount: number;
    oError: boolean;
    onLike: () => void;
    onUnlike: () => void;
    // ── Rate ───────────────────────────────────────────────────────
    // Current rating in stars (0–5). Null when no rating.
    ratingStars: number | null;
    onSetRating: (stars: number | null) => void;
    // When the Advanced Rating plugin is installed, the rate button
    // opens the full criterion modal instead of the inline strip.
    // The caller is responsible for mounting the modal — this is just
    // the "open it" trigger.
    onOpenAdvancedRating?: () => void;
    // ── Save / bookmark ────────────────────────────────────────────
    // Per-collection membership map. Keys are tagName values from
    // BINGE_COLLECTIONS. Bookmark button is filled if ANY value is
    // true. Tapping the bookmark opens the SaveMenu popover which
    // toggles individual entries.
    inCollections: Record<string, boolean>;
    onToggleCollection: (tagName: string) => void;
    // ── Multiview ──────────────────────────────────────────────────
    // Mounted only when the multiView plugin is enabled.
    inMultiviewQueue: boolean;
    onToggleMultiviewQueue: () => void;
    onOpenMultiviewPlayer: () => void;
    // ── Scribe ─────────────────────────────────────────────────────
    // Mounted only when the stashScribe plugin is enabled. Opens the
    // scene's Stash page in a new tab (Scribe injects its modal
    // trigger there — it can't be deep-linked).
    onOpenScribe: () => void;
    // ── More menu ──────────────────────────────────────────────────
    // Fires when the user taps the ⋯ button. The slide owns the sheet
    // contents (currently just "Open in Stash") so callers can extend
    // it without touching ActionStack.
    onOpenMore: () => void;
}

// Heart hold-to-unlike duration. Mirrors common mobile long-press
// thresholds; 1500 chosen for "long enough to never trigger by accident".
const HEART_HOLD_DURATION_MS = 1500;
// Multiview long-press → open player.
const MULTIVIEW_HOLD_DURATION_MS = 700;

// Right-side TikTok/Instagram-style vertical action column. Top-to-bottom:
//   1. Heart (O-counter; tap = like, hold = unlike)
//   2. Rate (star icon; tap = open rate strip)
//   3. Multiview (grid icon; tap = toggle queue, hold = open player)
//   4. Scribe (pencil icon; tap = open scene page in new tab)
//   5. Bookmark (favourite scene via the "Favourite ★" tag)
//
// Multiview + Scribe only render when their respective Stash plugins
// are installed AND enabled (see PluginContext).
export function ActionStack({
    oCount,
    oError,
    onLike,
    onUnlike,
    ratingStars,
    onSetRating,
    onOpenAdvancedRating,
    inCollections,
    onToggleCollection,
    inMultiviewQueue,
    onToggleMultiviewQueue,
    onOpenMultiviewPlayer,
    onOpenScribe,
    onOpenMore,
}: ActionStackProps) {
    const hasMultiview = useHasMultiview();
    const hasScribe = useHasScribe();
    const hasAdvancedRating = useHasAdvancedRating();
    const [rateStripOpen, setRateStripOpen] = useState(false);
    const useAdvancedRating = hasAdvancedRating && !!onOpenAdvancedRating;

    return (
        <aside className="binge-actions" aria-label="scene actions">
            <HeartButton
                oCount={oCount}
                oError={oError}
                onLike={onLike}
                onUnlike={onUnlike}
            />

            <RateButton
                ratingStars={ratingStars}
                expanded={useAdvancedRating ? false : rateStripOpen}
                advanced={useAdvancedRating}
                onToggleStrip={() => {
                    if (useAdvancedRating) {
                        onOpenAdvancedRating?.();
                    } else {
                        setRateStripOpen((v) => !v);
                    }
                }}
                onSetRating={(s) => {
                    onSetRating(s);
                    setRateStripOpen(false);
                }}
                onDismiss={() => setRateStripOpen(false)}
            />

            {hasMultiview && (
                <MultiviewButton
                    inQueue={inMultiviewQueue}
                    onTap={onToggleMultiviewQueue}
                    onHold={onOpenMultiviewPlayer}
                />
            )}

            {hasScribe && <ScribeButton onTap={onOpenScribe} />}

            <BookmarkButton
                inCollections={inCollections}
                onToggleCollection={onToggleCollection}
            />

            <button
                type="button"
                className="binge-action-button binge-more-button"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenMore();
                }}
                aria-label="More actions"
                title="More"
            >
                <MoreIcon />
            </button>
        </aside>
    );
}

// ── Heart ─────────────────────────────────────────────────────────────

function HeartButton({
    oCount,
    oError,
    onLike,
    onUnlike,
}: {
    oCount: number;
    oError: boolean;
    onLike: () => void;
    onUnlike: () => void;
}) {
    const [holding, setHolding] = useState(false);
    const holdTimerRef = useRef<number | null>(null);
    const heldDownRef = useRef(false);

    useEffect(() => {
        return () => {
            if (holdTimerRef.current !== null)
                window.clearTimeout(holdTimerRef.current);
        };
    }, []);

    const cancelHold = () => {
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        setHolding(false);
    };

    const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (
        e
    ) => {
        e.stopPropagation();
        heldDownRef.current = false;
        setHolding(true);
        holdTimerRef.current = window.setTimeout(() => {
            heldDownRef.current = true;
            holdTimerRef.current = null;
            setHolding(false);
            onUnlike();
        }, HEART_HOLD_DURATION_MS);
    };

    const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = (
        e
    ) => {
        e.stopPropagation();
        if (heldDownRef.current) {
            heldDownRef.current = false;
            cancelHold();
            return;
        }
        cancelHold();
        onLike();
    };

    const handlePointerLeave = () => {
        if (holdTimerRef.current !== null) cancelHold();
    };

    const suppressContextMenu: React.MouseEventHandler<HTMLButtonElement> = (
        e
    ) => e.preventDefault();

    return (
        <button
            type="button"
            className={
                "binge-action-button binge-o-button" +
                (oCount > 0 ? " is-active" : "") +
                (oError ? " is-error" : "") +
                (holding ? " is-holding" : "")
            }
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
            onContextMenu={suppressContextMenu}
            aria-label={`O counter ${oCount}. Tap to like, hold to unlike.`}
            title="Tap to like · hold to unlike"
        >
            <HeartIcon filled={oCount > 0} />
            {oCount > 0 && (
                <span className="binge-action-count">{oCount}</span>
            )}
        </button>
    );
}

// ── Rate ──────────────────────────────────────────────────────────────

function RateButton({
    ratingStars,
    expanded,
    advanced,
    onToggleStrip,
    onSetRating,
    onDismiss,
}: {
    ratingStars: number | null;
    expanded: boolean;
    advanced: boolean;
    onToggleStrip: () => void;
    onSetRating: (stars: number | null) => void;
    onDismiss: () => void;
}) {
    const rated = (ratingStars ?? 0) > 0;
    return (
        <div className="binge-action-rate-wrap">
            {expanded && !advanced && (
                <RateStrip
                    current={ratingStars ?? 0}
                    onPick={onSetRating}
                    onDismiss={onDismiss}
                />
            )}
            <button
                type="button"
                className={
                    "binge-action-button binge-rate-button" +
                    (rated ? " is-active" : "") +
                    (advanced ? " is-advanced" : "")
                }
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleStrip();
                }}
                aria-label={
                    ratingStars
                        ? `Rated ${ratingStars} stars. Tap to change.`
                        : advanced
                          ? "Rate this scene (advanced)"
                          : "Rate this scene"
                }
                title={advanced ? "Rate (advanced)" : "Rate"}
            >
                <StarIcon filled={rated} />
                {rated && (
                    <span className="binge-action-count">{ratingStars}</span>
                )}
            </button>
        </div>
    );
}

function RateStrip({
    current,
    onPick,
    onDismiss,
}: {
    current: number;
    onPick: (stars: number | null) => void;
    onDismiss: () => void;
}) {
    // Tap outside dismisses. The strip's stopPropagation prevents
    // clicks within it from bubbling to this listener.
    useEffect(() => {
        const onClick = () => onDismiss();
        // RAF defer so the click that opened the strip doesn't
        // immediately close it.
        const id = window.requestAnimationFrame(() => {
            window.addEventListener("click", onClick);
        });
        return () => {
            window.cancelAnimationFrame(id);
            window.removeEventListener("click", onClick);
        };
    }, [onDismiss]);

    return (
        <div
            className="binge-rate-strip"
            onClick={(e) => e.stopPropagation()}
            role="radiogroup"
            aria-label="Rate scene"
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    className={
                        "binge-rate-star" + (n <= current ? " is-filled" : "")
                    }
                    onClick={(e) => {
                        e.stopPropagation();
                        // Tapping the current rating clears it (toggle).
                        onPick(n === current ? null : n);
                    }}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    role="radio"
                    aria-checked={n === current}
                >
                    <StarIcon filled={n <= current} />
                </button>
            ))}
        </div>
    );
}

// ── Multiview ────────────────────────────────────────────────────────

function MultiviewButton({
    inQueue,
    onTap,
    onHold,
}: {
    inQueue: boolean;
    onTap: () => void;
    onHold: () => void;
}) {
    const holdTimerRef = useRef<number | null>(null);
    const heldRef = useRef(false);

    useEffect(() => {
        return () => {
            if (holdTimerRef.current !== null)
                window.clearTimeout(holdTimerRef.current);
        };
    }, []);

    const onPointerDown: React.PointerEventHandler<HTMLButtonElement> = (e) => {
        e.stopPropagation();
        heldRef.current = false;
        holdTimerRef.current = window.setTimeout(() => {
            heldRef.current = true;
            holdTimerRef.current = null;
            onHold();
        }, MULTIVIEW_HOLD_DURATION_MS);
    };
    const onPointerUp: React.PointerEventHandler<HTMLButtonElement> = (e) => {
        e.stopPropagation();
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (!heldRef.current) onTap();
    };
    const onPointerLeave = () => {
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    return (
        <button
            type="button"
            className={
                "binge-action-button binge-multiview-button" +
                (inQueue ? " is-active" : "")
            }
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerLeave}
            aria-label={
                inQueue
                    ? "Remove from Multiview queue. Hold to open player."
                    : "Add to Multiview queue. Hold to open player."
            }
            title="Tap to queue · hold to open Multiview"
        >
            <GridIcon filled={inQueue} />
        </button>
    );
}

// ── Scribe ───────────────────────────────────────────────────────────

function ScribeButton({ onTap }: { onTap: () => void }) {
    return (
        <button
            type="button"
            className="binge-action-button binge-scribe-button"
            onClick={(e) => {
                e.stopPropagation();
                onTap();
            }}
            aria-label="Open scene in Stash to write a review"
            title="Write a review (opens scene in Stash)"
        >
            <PencilIcon />
        </button>
    );
}

// ── Bookmark + Save sheet ────────────────────────────────────────────

function BookmarkButton({
    inCollections,
    onToggleCollection,
}: {
    inCollections: Record<string, boolean>;
    onToggleCollection: (tagName: string) => void;
}) {
    const [sheetOpen, setSheetOpen] = useState(false);
    // Filled when in ANY collection — single visual signal that the
    // scene is "saved" without committing to which folder.
    const savedSomewhere = Object.values(inCollections).some((v) => v);
    return (
        <>
            <button
                type="button"
                className={
                    "binge-action-button binge-bookmark-button" +
                    (savedSomewhere ? " is-active" : "")
                }
                onClick={(e) => {
                    e.stopPropagation();
                    setSheetOpen(true);
                }}
                aria-label={
                    savedSomewhere ? "Manage saved-to" : "Save scene"
                }
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                title="Save to..."
            >
                <BookmarkIcon filled={savedSomewhere} />
            </button>
            {sheetOpen && (
                <SaveSheet
                    inCollections={inCollections}
                    onToggle={onToggleCollection}
                    onClose={() => setSheetOpen(false)}
                />
            )}
        </>
    );
}

// ── Icons ────────────────────────────────────────────────────────────

// Icon paths are Lucide-derived (lucide.dev — ISC). Stroke 2.2 reads
// as solid enough to match IG/TikTok's action-stack weight without
// looking chunky. Filled variants use stroke 0 to avoid the double-
// edge artefact you get when stroke + fill both draw the same path.
const ICON_STROKE = 1.5;
const ICON_LINE_PROPS = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};

export function HeartIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            className="binge-heart"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.9em"
            height="2.9em"
            {...ICON_LINE_PROPS}
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={filled ? 0 : ICON_STROKE}
            aria-hidden="true"
        >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
        </svg>
    );
}

export function StarIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.6em"
            height="2.6em"
            {...ICON_LINE_PROPS}
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={filled ? 0 : ICON_STROKE}
            aria-hidden="true"
        >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}

export function GridIcon({ filled }: { filled: boolean }) {
    // 4-cell grid — read as "Multiview".
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.6em"
            height="2.6em"
            {...ICON_LINE_PROPS}
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={filled ? 0 : ICON_STROKE}
            aria-hidden="true"
        >
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
    );
}

export function PencilIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.6em"
            height="2.6em"
            {...ICON_LINE_PROPS}
            aria-hidden="true"
        >
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            <path d="m15 5 4 4" />
        </svg>
    );
}

export function MoreIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.6em"
            height="2.6em"
            {...ICON_LINE_PROPS}
            aria-hidden="true"
        >
            <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function BookmarkIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="2.7em"
            height="2.7em"
            {...ICON_LINE_PROPS}
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={filled ? 0 : ICON_STROKE}
            aria-hidden="true"
        >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
    );
}
