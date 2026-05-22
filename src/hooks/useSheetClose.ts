import { useCallback, useEffect, useRef, useState } from "react";

// Two-phase close for bottom sheets / modals: flip an `is-exiting`
// state so CSS can play the close animation, then call the real
// onClose after `durationMs`. Without this, conditionally-rendered
// sheets just unmount on click-off and the open animation feels
// asymmetric.
//
// Returns { isExiting, beginClose }. Wire `beginClose` into the
// backdrop onClick, the close (×) button, and the Escape handler.
// Pass `isExiting` into a class on the root element so the CSS
// `.is-exiting` selectors take effect.
export function useSheetClose(
    onClose: () => void,
    durationMs = 280
): { isExiting: boolean; beginClose: () => void } {
    const [isExiting, setIsExiting] = useState(false);
    const timer = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (timer.current !== null) {
                window.clearTimeout(timer.current);
                timer.current = null;
            }
        };
    }, []);

    const beginClose = useCallback(() => {
        if (isExiting) return;
        setIsExiting(true);
        timer.current = window.setTimeout(() => {
            timer.current = null;
            onClose();
        }, durationMs);
    }, [isExiting, onClose, durationMs]);

    return { isExiting, beginClose };
}
