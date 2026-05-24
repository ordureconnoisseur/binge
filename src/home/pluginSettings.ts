import { useEffect, useState } from "react";

// Plugin-settings the reel SPA shares with the Stash settings panel
// injected by binge.entry.js. Storage is plain localStorage keyed under
// `binge.*`; same-origin between the settings page (Stash SPA) and the
// reel page (this SPA), so values written from one are readable from
// the other.
//
// Live updates: the browser fires `storage` events in OTHER tabs when
// localStorage changes — so flipping a toggle in the Stash settings
// tab live-updates the open binge tab without a reload.

const SHOW_GALLERIES_KEY = "binge.showGalleries";
const SHOW_DEBUG_KEY = "binge.showDebug";
const INCLUDE_STASHDB_KEY = "binge.includeStashDB";
const INCLUDE_STASHDB_IN_PROFILE_KEY = "binge.includeStashDBInProfile";
const INCLUDE_REDDIT_KEY = "binge.includeReddit";
const AUTO_SCROLL_KEY = "binge.autoScroll";
const REFRACT_INTEGRATION_KEY = "binge.refractIntegration";
const BINGE_SERVER_URL_KEY = "binge.bingeServerUrl";
const LOOKBACK_DAYS_KEY = "binge.lookbackDays";
// Defaults to the loopback address — what a typical user runs once
// binge-server is installed on the same machine as Stash. Users with
// a remote daemon (the original mini deploy) override via Settings.
const DEFAULT_BINGE_SERVER_URL = "http://localhost:7878";
// Stream-type key matches src/config.ts (legacy reader still used in
// imperative call sites like SceneSlide). Kept in sync via the same
// localStorage entry.
const TRANSCODE_KEY = "binge.transcodeType";
export type TranscodeType = "auto" | "direct" | "mp4" | "webm" | "hls";
export const ALLOWED_TRANSCODE: ReadonlyArray<TranscodeType> = [
    "auto",
    "direct",
    "mp4",
    "webm",
    "hls",
];

// Allowed lookback window values (in days). Mirrored in
// binge.entry.js's settings panel dropdown — keep these in sync.
export const ALLOWED_LOOKBACK_DAYS: ReadonlyArray<number> = [
    7, 14, 30, 60, 90, 180, 365,
];
const DEFAULT_LOOKBACK_DAYS = 30;

function readBool(key: string, defaultValue: boolean): boolean {
    try {
        const stored = localStorage.getItem(key);
        return stored === null ? defaultValue : stored === "1";
    } catch {
        return defaultValue;
    }
}

function readNumber(
    key: string,
    defaultValue: number,
    allowed?: ReadonlyArray<number>
): number {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        const parsed = parseInt(stored, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
        if (allowed && !allowed.includes(parsed)) return defaultValue;
        return parsed;
    } catch {
        return defaultValue;
    }
}

function readString<T extends string>(
    key: string,
    defaultValue: T,
    allowed: ReadonlyArray<T>
): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored && (allowed as ReadonlyArray<string>).includes(stored)) {
            return stored as T;
        }
    } catch {
        /* fall through */
    }
    return defaultValue;
}

function writeNumber(key: string, value: number): void {
    try {
        localStorage.setItem(key, String(value));
    } catch (err) {
        // Likely incognito / quota — value stays in React state but
        // won't survive a reload. Surface in DevTools so the issue is
        // debuggable.
        console.warn("[binge] localStorage write failed", key, err);
    }
    notify(key);
}

function writeString(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.warn("[binge] localStorage write failed", key, err);
    }
    notify(key);
}

// Tiny in-memory pubsub. The browser's `storage` event fires only in
// OTHER tabs/windows — not in the same tab that wrote the value. We
// need same-tab notification for the keyboard-toggle hotkey path
// (write + re-read happen in the same tab). The pubsub handles that;
// `storage` still handles cross-tab.
type Listener = (key: string) => void;
const listeners = new Set<Listener>();
function notify(key: string): void {
    for (const l of listeners) l(key);
}

function writeBool(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, value ? "1" : "0");
    } catch (err) {
        console.warn("[binge] localStorage write failed", key, err);
    }
    notify(key);
}

function useStoredBool(key: string, defaultValue: boolean): boolean {
    const [value, setValue] = useState<boolean>(() =>
        readBool(key, defaultValue)
    );
    useEffect(() => {
        const update = () => setValue(readBool(key, defaultValue));
        const localHandler = (changedKey: string) => {
            if (changedKey === key) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === key) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, [key, defaultValue]);
    return value;
}

function useStoredNumber(
    key: string,
    defaultValue: number,
    allowed?: ReadonlyArray<number>
): number {
    const [value, setValue] = useState<number>(() =>
        readNumber(key, defaultValue, allowed)
    );
    useEffect(() => {
        const update = () => setValue(readNumber(key, defaultValue, allowed));
        const localHandler = (changedKey: string) => {
            if (changedKey === key) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === key) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, [key, defaultValue, allowed]);
    return value;
}

function useStoredString<T extends string>(
    key: string,
    defaultValue: T,
    allowed: ReadonlyArray<T>
): T {
    const [value, setValue] = useState<T>(() =>
        readString(key, defaultValue, allowed)
    );
    useEffect(() => {
        const update = () => setValue(readString(key, defaultValue, allowed));
        const localHandler = (changedKey: string) => {
            if (changedKey === key) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === key) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, [key, defaultValue, allowed]);
    return value;
}

// Free-form string reader/hook (no allowed-list). Used for the
// binge-server URL — any user-typed URL must round-trip verbatim.
function readFreeString(key: string, defaultValue: string): string {
    try {
        const stored = localStorage.getItem(key);
        if (stored !== null && stored.length > 0) return stored;
    } catch {
        /* fall through */
    }
    return defaultValue;
}

function useStoredFreeString(key: string, defaultValue: string): string {
    const [value, setValue] = useState<string>(() =>
        readFreeString(key, defaultValue)
    );
    useEffect(() => {
        const update = () => setValue(readFreeString(key, defaultValue));
        const localHandler = (changedKey: string) => {
            if (changedKey === key) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === key) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, [key, defaultValue]);
    return value;
}

export function useShowGalleries(): boolean {
    return useStoredBool(SHOW_GALLERIES_KEY, true);
}

export function useShowDebug(): boolean {
    return useStoredBool(SHOW_DEBUG_KEY, false);
}

// StashDB integration. On by default; if the user hasn't configured a
// StashDB API key in Stash's stashbox config, the merge silently
// does nothing (getStashDBBox returns null). No-op cost is one
// configuration GraphQL query.
export function useIncludeStashDB(): boolean {
    return useStoredBool(INCLUDE_STASHDB_KEY, true);
}

// Mixes StashDB-only scenes (those you don't own yet) into the
// scene grid on a library performer's profile, alongside their
// library scenes. Separate toggle from the stories integration so
// users can enable one without the other.
// Off by default — when looking at a single performer, most users
// want their library scenes front-and-center and only flip this on
// when they want to compare against the StashDB catalog.
export function useIncludeStashDBInProfile(): boolean {
    return useStoredBool(INCLUDE_STASHDB_IN_PROFILE_KEY, false);
}

// Reddit integration. On by default; if binge-server is unreachable
// the merge silently no-ops (network fetch returns []), so leaving
// this on with no daemon running just costs one failed fetch per
// Home mount.
export function useIncludeReddit(): boolean {
    return useStoredBool(INCLUDE_REDDIT_KEY, true);
}

// Auto-scroll the reel — when on, the active video plays once (loop
// off) and the slide advances to the next scene on its `ended` event.
// User can still manually swipe at any time.
export function useAutoScroll(): boolean {
    return useStoredBool(AUTO_SCROLL_KEY, false);
}
export function readAutoScroll(): boolean {
    return readBool(AUTO_SCROLL_KEY, false);
}
export function setAutoScroll(value: boolean): void {
    writeBool(AUTO_SCROLL_KEY, value);
}

// Refract integration — when on, the app reads refract's accent vars
// from localStorage and applies them as inline CSS variables so binge
// follows the user's refract palette. When off (default), binge uses
// its own bundled tokens. Off by default so users without refract or
// who prefer binge's native palette get a clean experience.
export function useRefractIntegration(): boolean {
    return useStoredBool(REFRACT_INTEGRATION_KEY, false);
}
export function setRefractIntegration(value: boolean): void {
    writeBool(REFRACT_INTEGRATION_KEY, value);
}

// binge-server URL. Read both as a React hook and via the imperative
// reader below (used by src/api/bingeServer.ts inside async fetches).
export function useBingeServerUrl(): string {
    return useStoredFreeString(BINGE_SERVER_URL_KEY, DEFAULT_BINGE_SERVER_URL);
}
export function readBingeServerUrl(): string {
    return readFreeString(BINGE_SERVER_URL_KEY, DEFAULT_BINGE_SERVER_URL);
}

// Imperative toggle — used by the global `\` hotkey in App.tsx so the
// debug overlay can be flipped without leaving the reel tab.
export function toggleShowDebug(): void {
    writeBool(SHOW_DEBUG_KEY, !readBool(SHOW_DEBUG_KEY, false));
}

// Lookback window for "new" content surfaced on Home. Drives both the
// stories row (library + StashDB) and the Feed's initial fetch window.
// Default 30 days. User-configurable via the plugin settings dropdown.
export function useLookbackDays(): number {
    return useStoredNumber(
        LOOKBACK_DAYS_KEY,
        DEFAULT_LOOKBACK_DAYS,
        ALLOWED_LOOKBACK_DAYS
    );
}

// Stream type (transcode preference) for the reel's video element.
// Imperative reader lives in src/config.ts; this hook exposes it to
// React components (e.g. the SettingsPage).
export function useTranscodeType(): TranscodeType {
    return useStoredString(TRANSCODE_KEY, "auto", ALLOWED_TRANSCODE);
}

// ── Public setters (used by the in-app SettingsPage) ────────────────
// Each writes to localStorage AND fires the pubsub so all open
// SceneSlides / hooks reflect the change instantly.

export function setShowGalleries(value: boolean): void {
    writeBool(SHOW_GALLERIES_KEY, value);
}
export function setShowDebug(value: boolean): void {
    writeBool(SHOW_DEBUG_KEY, value);
}
export function setIncludeStashDB(value: boolean): void {
    writeBool(INCLUDE_STASHDB_KEY, value);
}
export function setIncludeStashDBInProfile(value: boolean): void {
    writeBool(INCLUDE_STASHDB_IN_PROFILE_KEY, value);
}
export function setIncludeReddit(value: boolean): void {
    writeBool(INCLUDE_REDDIT_KEY, value);
}
export function setBingeServerUrl(value: string): void {
    // Strip trailing slash so concatenations are predictable.
    const trimmed = value.trim().replace(/\/+$/, "");
    writeString(BINGE_SERVER_URL_KEY, trimmed);
}
export function setLookbackDays(value: number): void {
    if (!ALLOWED_LOOKBACK_DAYS.includes(value)) return;
    writeNumber(LOOKBACK_DAYS_KEY, value);
}
export function setTranscodeType(value: TranscodeType): void {
    if (!ALLOWED_TRANSCODE.includes(value)) return;
    writeString(TRANSCODE_KEY, value);
}
