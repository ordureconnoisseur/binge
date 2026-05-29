import { useEffect, useState } from "react";
import { BingeLoadingIcon } from "./BingeLoadingIcon";
import { usePluginLoaded } from "../plugins/PluginContext";

// Full-screen splash shown on first paint to cover the blank
// window between SPA mount and the first useful render.
// Mounted inside PluginProvider at the top of App so every tab
// is covered (deeplinks into /foryou, /performer/x, etc.).
//
// Dismissal gate: PluginContext.loaded — set true once the
// plugins-enumeration query returns. This is the canonical
// "Stash is reachable" signal and a prerequisite for anything
// else the app does. Bounded by min/max so:
// - MIN_HOLD_MS gives a brand moment even on a warm cache
// - MAX_HOLD_MS lets the user past the splash if Stash is
//   unreachable (the rest of the app will then surface its own
//   error state)
const MIN_HOLD_MS = 600;
const MAX_HOLD_MS = 4500;
const FADE_MS = 320;

export function BingeStartupSplash() {
    const pluginLoaded = usePluginLoaded();
    const [phase, setPhase] = useState<"hold" | "fade" | "gone">("hold");
    const [minElapsed, setMinElapsed] = useState(false);

    // Tick min-hold so a synchronous cache hit on PluginContext
    // doesn't make the splash flash off after one frame.
    useEffect(() => {
        const t = setTimeout(() => setMinElapsed(true), MIN_HOLD_MS);
        return () => clearTimeout(t);
    }, []);

    // Max safety cutoff — fires no matter what so a slow or
    // dead Stash doesn't trap the user behind the splash. Only
    // promotes from "hold": this []-deps timer is never re-cleared
    // (the component returns null but stays mounted), so without the
    // guard it would re-show an already-dismissed splash at MAX_HOLD.
    useEffect(() => {
        const t = setTimeout(
            () => setPhase((p) => (p === "hold" ? "fade" : p)),
            MAX_HOLD_MS
        );
        return () => clearTimeout(t);
    }, []);

    // Ready when both signals align: min hold elapsed AND
    // plugins query has landed.
    useEffect(() => {
        if (phase !== "hold") return;
        if (minElapsed && pluginLoaded) setPhase("fade");
    }, [phase, minElapsed, pluginLoaded]);

    // After the fade transition finishes, unmount entirely.
    useEffect(() => {
        if (phase !== "fade") return;
        const t = setTimeout(() => setPhase("gone"), FADE_MS);
        return () => clearTimeout(t);
    }, [phase]);

    if (phase === "gone") return null;

    return (
        <div
            className={
                "binge-splash" + (phase === "fade" ? " is-dismissing" : "")
            }
            aria-hidden="true"
        >
            <BingeLoadingIcon className="binge-splash-icon" />
        </div>
    );
}
