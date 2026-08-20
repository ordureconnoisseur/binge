import { useEffect, useRef, useState, type RefObject } from "react";

// Hold the top-right of the frame to run at 2x; pull down while holding
// to latch it on, and repeat to let it go. The same gesture the iOS app
// uses, and the same one Instagram and X made muscle memory.
//
// The whole difficulty is that the reel is scrolled by the browser, and
// a hold and the opening of a slow swipe are the same touch. Everything
// below exists to tell them apart:
//
//   - Nothing is preventDefault'ed until the hold has been recognised,
//     so an ordinary swipe scrolls the reel exactly as it does today.
//     A hold that never completes leaves no trace at all.
//   - The browser withdraws the touch the moment it starts scrolling
//     (pointercancel), which cancels a hold in progress for free.
//   - Once the hold IS recognised, touchmove is preventDefault'ed so
//     the pull that latches the speed cannot also drag the reel.
//
// Pointer events rather than touch events, so a mouse gets the same
// gesture without a second code path. There is no scroll to compete
// with on a desktop, so it simply works there.

// Fraction of the frame's width, measured from the right edge, that
// responds to the hold. A quarter is close to Instagram's; the right
// edge is the part doing the work, since that is where a thumb rests.
const ZONE_WIDTH = 0.26;
// Fraction of the frame's height, from the top. Reaching the midpoint
// gives the thumb somewhere to land without extending into the lower
// half, where a swipe begins.
const ZONE_HEIGHT = 0.5;

// How long the pointer must stay down before this counts as a hold.
const HOLD_MS = 450;
// How far it may stray in that time before this is read as a swipe.
const ALLOWABLE_MOVE_PX = 8;

// How far UP the pointer travels, after the hold is recognised, before
// it is read as a scroll that happened to pause, and the speed is
// handed back. Small on purpose, and far smaller than the pull below:
// a hold that is genuinely a hold does not drift a centimetre upward,
// so there is nothing to protect by waiting, and every pixel spent
// waiting is time the video runs fast for someone who only wanted to
// scroll. Undoing should cost less than committing.
const ABANDON_PX = 10;
// How far DOWN it travels to latch 2x on, or off again. Comfortably
// past a thumb's idle wobble, comfortably short of a real scroll.
const LOCK_PULL_PX = 55;
// A pull covering that distance sooner than this after the hold
// engaged is a swipe that never stopped rather than a decision, and
// hands the speed back instead of latching. Someone who felt the
// gesture register pauses before pulling.
const PULL_GRACE_MS = 280;

// How long the toast stays up. Long enough to read, short enough that
// it is never in the way.
const TOAST_MS = 2000;

const FAST_RATE = 2;
const NORMAL_RATE = 1;

export interface SpeedToast {
    text: string;
    // Shown only when the pull latched or released the speed. A plain
    // hold says what the speed is and nothing more.
    icon: "locked" | "unlocked" | null;
    // Changes on every announcement so the pill can restart its
    // entrance animation even when the text is unchanged.
    tick: number;
}

export interface HoldForSpeed {
    toast: SpeedToast | null;
    // True when the pointer sequence that just ended was a hold, so the
    // click the browser is about to send should be ignored rather than
    // toggling play/pause. Reading it clears it.
    shouldSwallowTap: () => boolean;
}

export function useHoldForSpeed(
    targetRef: RefObject<HTMLElement | null>,
    videoRef: RefObject<HTMLVideoElement | null>,
): HoldForSpeed {
    const [toast, setToast] = useState<SpeedToast | null>(null);

    // Phase and geometry live in refs: a pointermove arrives every few
    // milliseconds and none of this belongs in a render.
    const phaseRef = useRef<"idle" | "pending" | "engaged" | "abandoned">(
        "idle",
    );
    const startRef = useRef({ x: 0, y: 0 });
    // Where the pointer was when the hold was recognised, so the pull is
    // measured from there rather than from touch-down.
    const originYRef = useRef(0);
    const engagedAtRef = useRef(0);
    const lockedRef = useRef(false);
    const pullConsumedRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const swallowRef = useRef(false);
    const toastTimerRef = useRef<number | null>(null);
    const tickRef = useRef(0);

    useEffect(() => {
        const el = targetRef.current;
        if (!el) return;

        const clearHoldTimer = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        // playbackRate alone is not enough: the browser resets it to
        // defaultPlaybackRate whenever the element loads a new source,
        // and this slide swaps its src imperatively.
        const applyRate = (rate: number) => {
            const video = videoRef.current;
            if (!video) return;
            // Speech stays intelligible at 2x with pitch correction on;
            // without it a 2x voice is a chipmunk.
            video.preservesPitch = true;
            video.defaultPlaybackRate = rate;
            video.playbackRate = rate;
        };

        const buzz = (ms: number) => {
            // Android only. iOS Safari has no vibration API at all, so
            // there the gesture is confirmed by the toast and by the
            // audio speeding up, which is what it has to be.
            navigator.vibrate?.(ms);
        };

        const dismissToast = () => {
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
            setToast(null);
        };

        const announce = (text: string, icon: SpeedToast["icon"] = null) => {
            tickRef.current += 1;
            setToast({ text, icon, tick: tickRef.current });
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
            }
            toastTimerRef.current = window.setTimeout(() => {
                toastTimerRef.current = null;
                setToast(null);
            }, TOAST_MS);
        };

        const engage = () => {
            timerRef.current = null;
            phaseRef.current = "engaged";
            engagedAtRef.current = performance.now();
            pullConsumedRef.current = false;
            swallowRef.current = true;
            if (lockedRef.current) {
                // Already at 2x, so there is no rate to change - but the
                // hold still has to say it registered, or there is
                // nothing to wait for and the pull to unlock starts
                // immediately, travels past the movement allowance
                // before the hold completes, and cancels it. Unlocking
                // then looks broken when in fact the hold never
                // happened.
                buzz(8);
                return;
            }
            applyRate(FAST_RATE);
            buzz(8);
            announce("2X speed");
        };

        // Undo an engagement that turned out to be the start of a
        // scroll. Leaves a latch alone: a locked slide was locked on
        // purpose in an earlier gesture, and a swipe is no reason to
        // undo that.
        const abandon = () => {
            phaseRef.current = "abandoned";
            if (!lockedRef.current) {
                applyRate(NORMAL_RATE);
                dismissToast();
            }
        };

        const pullDown = () => {
            if (pullConsumedRef.current) return;
            pullConsumedRef.current = true;
            lockedRef.current = !lockedRef.current;
            applyRate(lockedRef.current ? FAST_RATE : NORMAL_RATE);
            buzz(14);
            announce(
                lockedRef.current ? "2X speed" : "1X speed",
                lockedRef.current ? "locked" : "unlocked",
            );
        };

        const release = () => {
            const was = phaseRef.current;
            phaseRef.current = "idle";
            clearHoldTimer();
            if (was !== "engaged") return;
            // Letting go of a locked slide changes nothing, so it says
            // nothing. Letting go of a plain hold drops back to 1x, and
            // the 2X message still up would now be wrong, so it goes.
            if (!lockedRef.current) {
                applyRate(NORMAL_RATE);
                dismissToast();
            }
        };

        const inZone = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            return (
                e.clientX >= r.right - r.width * ZONE_WIDTH &&
                e.clientY <= r.top + r.height * ZONE_HEIGHT
            );
        };

        const onPointerDown = (e: PointerEvent) => {
            // A stale swallow would eat the next real tap: if the last
            // sequence ended without the click we expected, drop it.
            swallowRef.current = false;
            phaseRef.current = "idle";
            clearHoldTimer();
            if (!e.isPrimary) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (!inZone(e)) return;
            phaseRef.current = "pending";
            startRef.current = { x: e.clientX, y: e.clientY };
            originYRef.current = e.clientY;
            timerRef.current = window.setTimeout(engage, HOLD_MS);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!e.isPrimary) return;
            if (phaseRef.current === "pending") {
                const dx = e.clientX - startRef.current.x;
                const dy = e.clientY - startRef.current.y;
                if (Math.hypot(dx, dy) > ALLOWABLE_MOVE_PX) {
                    // Moving already: this is a swipe, and the browser
                    // is welcome to it.
                    phaseRef.current = "idle";
                    clearHoldTimer();
                    return;
                }
                // The pointer may drift a little before settling, so
                // keep the origin current until the hold engages.
                originYRef.current = e.clientY;
                return;
            }
            if (phaseRef.current !== "engaged") return;
            const dy = e.clientY - originYRef.current;
            // Upward is a scroll that paused on its way, so give the
            // speed straight back and let the reel have the rest of the
            // gesture.
            if (dy <= -ABANDON_PX) {
                abandon();
                return;
            }
            if (dy < LOCK_PULL_PX) return;
            // Same rule downward: a pull arriving this soon after the
            // hold engaged is a swipe that never stopped.
            if (performance.now() - engagedAtRef.current < PULL_GRACE_MS) {
                abandon();
                return;
            }
            pullDown();
        };

        // preventDefault on a pointermove does not stop a scroll; only a
        // non-passive touchmove does. This is the web's version of
        // freezing the reel while the gesture owns the finger, and it is
        // deliberately confined to the engaged phase so a swipe that
        // never became a hold is untouched.
        const onTouchMove = (e: TouchEvent) => {
            if (phaseRef.current !== "engaged") return;
            if (e.cancelable) e.preventDefault();
        };

        // A long press over video offers to save it on Android and
        // raises the callout on iOS. Neither is wanted mid-gesture.
        const onContextMenu = (e: Event) => {
            if (phaseRef.current === "idle") return;
            e.preventDefault();
        };

        const onPointerUp = () => release();
        // pointercancel means the browser took the touch, almost always
        // to scroll with it.
        const onPointerCancel = () => release();

        // Reapply after a source swap, which resets the rate to the
        // element default, so a latched slide comes back fast.
        const onLoadedMetadata = () => {
            applyRate(lockedRef.current ? FAST_RATE : NORMAL_RATE);
        };

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("contextmenu", onContextMenu);
        const video = videoRef.current;
        video?.addEventListener("loadedmetadata", onLoadedMetadata);

        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("contextmenu", onContextMenu);
            video?.removeEventListener("loadedmetadata", onLoadedMetadata);
            clearHoldTimer();
            if (toastTimerRef.current !== null) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
            }
        };
    }, [targetRef, videoRef]);

    const shouldSwallowTap = () => {
        const swallow = swallowRef.current;
        swallowRef.current = false;
        return swallow;
    };

    return { toast, shouldSwallowTap };
}
