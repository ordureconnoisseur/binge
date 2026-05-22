import { useEffect, useState } from "react";

// Two-layer mute state.
//
// `persisted` is the user's stated preference. Default unmuted (Instagram
// convention), survives reload via localStorage. Only changes when the
// user explicitly taps the Mute toggle.
//
// `effective` is what's actually applied to the video right now. It drives
// the toggle's UI state so the icon never lies. Differs from `persisted`
// when the browser blocks unmuted autoplay — at that point we flip
// effective→muted so the icon matches reality, but leave persisted alone
// so the next slide gets a fresh chance to play unmuted (and once it
// succeeds, effective syncs back to persisted).
//
// Why this fixes the "icon says unmuted, video stays muted" bug: previously
// the autoplay fallback muted the element without touching React. With
// two layers, fallback updates effective→true (UI shows muted), and a
// single toggle tap from the user sets persisted+effective→false in one
// step (no more double-tap dance).
const MUTE_KEY = "binge.muted";
const DEFAULT_MUTED = false;

function readPersisted(): boolean {
    try {
        const raw = localStorage.getItem(MUTE_KEY);
        if (raw === "false") return false;
        if (raw === "true") return true;
    } catch {
        /* private mode */
    }
    return DEFAULT_MUTED;
}

const listeners = new Set<(muted: boolean) => void>();
let persisted = readPersisted();
let effective = persisted;

function setPersistent(next: boolean) {
    persisted = next;
    effective = next;
    try {
        localStorage.setItem(MUTE_KEY, String(next));
    } catch {
        /* ignore */
    }
    listeners.forEach((l) => l(next));
}

function setSession(next: boolean) {
    effective = next;
    listeners.forEach((l) => l(next));
}

export function getPersistedMuted(): boolean {
    return persisted;
}

export function useMuteState(): [
    boolean,
    (next: boolean) => void,
    (next: boolean) => void,
] {
    const [muted, setMuted] = useState<boolean>(effective);
    useEffect(() => {
        listeners.add(setMuted);
        return () => {
            listeners.delete(setMuted);
        };
    }, []);
    return [muted, setPersistent, setSession];
}
