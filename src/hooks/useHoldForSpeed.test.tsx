// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoldForSpeed } from "./useHoldForSpeed";

// The gesture has to separate a hold from the opening of a slow swipe,
// and the two are the same touch until they are not. Every case below
// is one that got it wrong at some point on the iOS side, where this
// was tuned by hand on a phone; here they are cheap to keep.

const WIDTH = 400;
const HEIGHT = 800;
// Anywhere past 74% of the width and inside the top half.
const IN_ZONE = { x: 360, y: 120 };
const LEFT = { x: 40, y: 120 };
const BOTTOM_RIGHT = { x: 360, y: 700 };

let button: HTMLButtonElement;
let video: HTMLVideoElement;
let swallow: () => boolean;

// The toast is read back out of the DOM rather than captured from the
// hook, which is both what the viewer actually sees and the only way to
// observe it without writing to a module global during render.
function Harness() {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const speed = useHoldForSpeed(buttonRef, videoRef);
    useEffect(() => {
        swallow = speed.shouldSwallowTap;
    }, [speed.shouldSwallowTap]);
    return (
        <>
            <video ref={videoRef} data-testid="video" />
            <button ref={buttonRef} data-testid="target" />
            <span data-testid="toast">
                {speed.toast
                    ? speed.toast.text + "|" + (speed.toast.icon ?? "")
                    : ""}
            </span>
        </>
    );
}

/// "<text>|<icon>", or "" when nothing is showing.
function toastLabel() {
    return document.querySelector("[data-testid=toast]")?.textContent ?? "";
}

/// jsdom has no PointerEvent, and the hook only ever reads coordinates
/// and the two identity fields, so a plain event carrying them is a
/// faithful stand-in.
function pointer(
    type: string,
    at: { x: number; y: number } = IN_ZONE,
    pointerType = "touch",
) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
        clientX: at.x,
        clientY: at.y,
        isPrimary: true,
        pointerType,
        button: 0,
    });
    return e;
}

function down(at?: { x: number; y: number }, pointerType?: string) {
    act(() => {
        button.dispatchEvent(pointer("pointerdown", at, pointerType));
    });
}
function move(at: { x: number; y: number }, pointerType?: string) {
    act(() => {
        button.dispatchEvent(pointer("pointermove", at, pointerType));
    });
}
function up() {
    act(() => {
        button.dispatchEvent(pointer("pointerup"));
    });
}
// Steps both clocks together. Advancing the timers in one jump would
// fire the hold at the end of the window while performance.now already
// read the far side of it, so every pull would look instantaneous.
function wait(ms: number) {
    act(() => {
        for (let done = 0; done < ms; done += 10) {
            const step = Math.min(10, ms - done);
            clock += step;
            vi.advanceTimersByTime(step);
        }
    });
}

/// Past the hold threshold, and then past the grace that rejects a pull
/// arriving so fast it must be a swipe that never stopped.
function holdUntilEngaged() {
    down();
    wait(800);
}

// The grace that separates a deliberate pull from a swipe that never
// stopped is measured against performance.now, so it has to move with
// the fake timers. A frozen clock would reject every pull.
let clock = 0;

beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    render(<Harness />);
    button = document.querySelector("button")!;
    video = document.querySelector("video")!;
    button.getBoundingClientRect = () =>
        ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: WIDTH,
            bottom: HEIGHT,
            width: WIDTH,
            height: HEIGHT,
            toJSON: () => ({}),
        }) as DOMRect;
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("hold for speed", () => {
    it("leaves a quick tap alone", () => {
        down();
        wait(200);
        up();
        expect(video.playbackRate).toBe(1);
        expect(swallow()).toBe(false);
    });

    it("runs at 2x while held, and hands it back on release", () => {
        holdUntilEngaged();
        expect(video.playbackRate).toBe(2);
        // A plain hold says the speed and nothing about latching.
        expect(toastLabel()).toBe("2X speed|");
        up();
        expect(video.playbackRate).toBe(1);
        // The click the browser sends after a hold must not also
        // toggle play/pause.
        expect(swallow()).toBe(true);
    });

    it("ignores a hold outside the corner", () => {
        down(LEFT);
        wait(500);
        expect(video.playbackRate).toBe(1);
        up();
        expect(swallow()).toBe(false);

        down(BOTTOM_RIGHT);
        wait(500);
        expect(video.playbackRate).toBe(1);
    });

    it("gives a moving finger back to the reel", () => {
        down();
        wait(200);
        // Past the movement allowance before the hold completes: this
        // is a swipe, and the browser is welcome to it.
        move({ x: IN_ZONE.x, y: IN_ZONE.y - 40 });
        wait(500);
        expect(video.playbackRate).toBe(1);
    });

    it("latches on a deliberate pull and survives the release", () => {
        holdUntilEngaged();
        move({ x: IN_ZONE.x, y: IN_ZONE.y + 60 });
        expect(toastLabel()).toBe("2X speed|locked");
        up();
        expect(video.playbackRate).toBe(2);
    });

    it("releases the latch on a second hold and pull", () => {
        holdUntilEngaged();
        move({ x: IN_ZONE.x, y: IN_ZONE.y + 60 });
        up();
        expect(video.playbackRate).toBe(2);

        holdUntilEngaged();
        // Still 2x during the second hold: there is nothing to change
        // until the pull decides.
        expect(video.playbackRate).toBe(2);
        move({ x: IN_ZONE.x, y: IN_ZONE.y + 60 });
        expect(toastLabel()).toBe("1X speed|unlocked");
        up();
        expect(video.playbackRate).toBe(1);
    });

    it("reads a pull arriving instantly as a swipe, not a choice", () => {
        down();
        // Engage and pull in the same frame: a finger that never
        // stopped moving.
        wait(460);
        move({ x: IN_ZONE.x, y: IN_ZONE.y + 60 });
        expect(video.playbackRate).toBe(1);
        up();
        expect(video.playbackRate).toBe(1);
    });

    it("hands the speed back the moment the finger goes up-screen", () => {
        holdUntilEngaged();
        expect(video.playbackRate).toBe(2);
        move({ x: IN_ZONE.x, y: IN_ZONE.y - 12 });
        expect(video.playbackRate).toBe(1);
        expect(toastLabel()).toBe("");
    });

    it("blocks the scroll only once the hold has engaged", () => {
        down();
        wait(200);
        const early = new Event("touchmove", {
            bubbles: true,
            cancelable: true,
        });
        button.dispatchEvent(early);
        expect(early.defaultPrevented).toBe(false);

        wait(500);
        const late = new Event("touchmove", {
            bubbles: true,
            cancelable: true,
        });
        button.dispatchEvent(late);
        expect(late.defaultPrevented).toBe(true);
    });

    it("works the same for a mouse", () => {
        down(IN_ZONE, "mouse");
        wait(500);
        expect(video.playbackRate).toBe(2);
        up();
        expect(video.playbackRate).toBe(1);
    });
});
