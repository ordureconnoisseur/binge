import { useEffect, useState } from "react";
import type { SpeedToast } from "../hooks/useHoldForSpeed";

// The message the hold-for-speed gesture leaves behind.
//
// Transient on purpose: a badge parked in a corner for as long as the
// video runs fast becomes furniture, and the speed is audible anyway.
// It names the new speed and goes.
//
// React unmounts immediately, so the component holds the last message
// itself for the length of the exit animation. Without that the pill
// would blink out, which reads as a glitch rather than an ending.
const EXIT_MS = 280;

export function SpeedPill({ toast }: { toast: SpeedToast | null }) {
    const [shown, setShown] = useState<SpeedToast | null>(null);
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (toast) {
            setShown(toast);
            setLeaving(false);
            return;
        }
        setLeaving(true);
        const timer = window.setTimeout(() => setShown(null), EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!shown) return null;
    return (
        <div
            className={"binge-speed-pill" + (leaving ? " is-leaving" : "")}
            /* Keyed on the tick so a second announcement replays the
               entrance even when the words are unchanged. */
            key={shown.tick}
            aria-live="polite"
        >
            {shown.icon && <LockGlyph open={shown.icon === "unlocked"} />}
            <span>{shown.text}</span>
        </div>
    );
}

// Only drawn when the pull latched or released the speed, so the shackle
// is the whole point of it: closed when locked, swung open when not.
function LockGlyph({ open }: { open: boolean }) {
    return (
        <svg
            className="binge-speed-pill-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <rect
                x="2"
                y="10.5"
                width="14"
                height="11"
                rx="3"
                fill="currentColor"
            />
            {/* Open swings the shackle clear to the right of the body,
                the way SF Symbols and Material both draw it, rather than
                straightening it: the hinge has to stay where it was or
                the two states look like different objects. */}
            <path
                d={
                    open
                        ? "M12.5 10.5V7a3.5 3.5 0 0 1 7 0"
                        : "M5.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"
                }
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    );
}
