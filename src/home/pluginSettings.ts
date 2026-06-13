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

const ALLOWED_GENDERS_KEY = "binge.allowedGenders";
const SHOW_GALLERIES_KEY = "binge.showGalleries";
const SHOW_DEBUG_KEY = "binge.showDebug";
const INCLUDE_STASHDB_KEY = "binge.includeStashDB";
const INCLUDE_STASHDB_IN_PROFILE_KEY = "binge.includeStashDBInProfile";
const INCLUDE_REDDIT_KEY = "binge.includeReddit";
const AUTO_SCROLL_KEY = "binge.autoScroll";
const REFRACT_INTEGRATION_KEY = "binge.refractIntegration";
const SHOWCASE_BLUR_KEY = "binge.showcaseBlur";
const DEMO_MODE_KEY = "binge.demoMode";
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

// Allowed lookback window values (in days). Rendered by the
// SettingsPage lookback dropdown. Capped at 90: the Home feed fetches
// the whole window at once (no infinite-scroll widening), so the
// window size bounds the fetch.
export const ALLOWED_LOOKBACK_DAYS: ReadonlyArray<number> = [
    7, 14, 30, 60, 90,
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

// StashDB gender enum subset surfaced as a user-pickable filter on
// the home discovery feed + Explore's Discover Performers bar. The
// 5 user-facing values; INTERSEX is dropped from the picker since
// stashdb tags it rarely and most users don't want it as a primary
// surface filter (still reachable via Stash itself).
export type Gender =
    | "FEMALE"
    | "MALE"
    | "TRANSGENDER_FEMALE"
    | "TRANSGENDER_MALE"
    | "NON_BINARY";
export const ALL_GENDERS: ReadonlyArray<Gender> = [
    "FEMALE",
    "MALE",
    "TRANSGENDER_FEMALE",
    "TRANSGENDER_MALE",
    "NON_BINARY",
];
// Default = all genders (neutral out of the box). Users narrow it in
// Settings → Genders to surface to taste.
const DEFAULT_ALLOWED_GENDERS: ReadonlySet<Gender> = new Set(ALL_GENDERS);

// Genders silently hidden everywhere, paired with the hidden-tag content
// exclusion (see HIDDEN_TAG_IDS in src/api/queries.ts). Trans performers
// are dropped from discovery + the stories row regardless of the "Genders
// to surface" setting — no UI, no pill. (The gender setting's trans
// toggles therefore have no visible effect while this is in place.)
export const HIDDEN_GENDERS: ReadonlySet<Gender> = new Set([
    "TRANSGENDER_FEMALE",
    "TRANSGENDER_MALE",
]);
// allowedGenders with the hidden genders removed, in canonical order —
// the effective set actually surfaced anywhere.
export function visibleGenders(genders: ReadonlySet<Gender>): Gender[] {
    return ALL_GENDERS.filter((g) => genders.has(g) && !HIDDEN_GENDERS.has(g));
}

function readGenderSet(): Set<Gender> {
    try {
        const stored = localStorage.getItem(ALLOWED_GENDERS_KEY);
        if (stored === null) return new Set(DEFAULT_ALLOWED_GENDERS);
        const parts = stored
            .split(",")
            .map((s) => s.trim())
            .filter((s): s is Gender =>
                (ALL_GENDERS as ReadonlyArray<string>).includes(s)
            );
        // Empty stored value is a real user choice ("show nothing").
        // Don't fall through to the default — respect the user's
        // intent, even if it leaves the discovery surfaces empty.
        return new Set(parts);
    } catch {
        return new Set(DEFAULT_ALLOWED_GENDERS);
    }
}

function useStoredGenderSet(): ReadonlySet<Gender> {
    const [value, setValue] = useState<Set<Gender>>(() => readGenderSet());
    useEffect(() => {
        const update = () => setValue(readGenderSet());
        const localHandler = (changedKey: string) => {
            if (changedKey === ALLOWED_GENDERS_KEY) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === ALLOWED_GENDERS_KEY) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, []);
    return value;
}

export function useAllowedGenders(): ReadonlySet<Gender> {
    return useStoredGenderSet();
}

export function readAllowedGenders(): ReadonlySet<Gender> {
    return readGenderSet();
}

export function setAllowedGenders(values: ReadonlySet<Gender>): void {
    // Preserve ALL_GENDERS canonical order on serialisation so the
    // stored value is stable across writes (helps diff tools and
    // anyone inspecting localStorage).
    const ordered = ALL_GENDERS.filter((g) => values.has(g));
    writeString(ALLOWED_GENDERS_KEY, ordered.join(","));
}

// ── Home-feed category filter ───────────────────────────────────────
// Lets the user hide whole categories of Home-feed cards via the filter
// menu next to the "Home" title. Stored as a comma-separated list of
// HIDDEN categories (empty = show everything, the default). Galleries
// are intentionally NOT a category here — they have their own
// "Show galleries" toggle.
export type FeedCategory = "discover" | "trending" | "posts" | "reposts";
export const ALL_FEED_CATEGORIES: ReadonlyArray<FeedCategory> = [
    "discover",
    "trending",
    "posts",
    "reposts",
];
const FEED_HIDDEN_KEY = "binge.feedHidden";

function readFeedHidden(): Set<FeedCategory> {
    try {
        const stored = localStorage.getItem(FEED_HIDDEN_KEY);
        if (!stored) return new Set();
        const parts = stored
            .split(",")
            .map((s) => s.trim())
            .filter((s): s is FeedCategory =>
                (ALL_FEED_CATEGORIES as ReadonlyArray<string>).includes(s)
            );
        return new Set(parts);
    } catch {
        return new Set();
    }
}

export function useHiddenFeedCategories(): ReadonlySet<FeedCategory> {
    const [value, setValue] = useState<Set<FeedCategory>>(() =>
        readFeedHidden()
    );
    useEffect(() => {
        const update = () => setValue(readFeedHidden());
        const localHandler = (changedKey: string) => {
            if (changedKey === FEED_HIDDEN_KEY) update();
        };
        const storageHandler = (e: StorageEvent) => {
            if (e.key === FEED_HIDDEN_KEY) update();
        };
        listeners.add(localHandler);
        window.addEventListener("storage", storageHandler);
        return () => {
            listeners.delete(localHandler);
            window.removeEventListener("storage", storageHandler);
        };
    }, []);
    return value;
}

export function setHiddenFeedCategories(
    values: ReadonlySet<FeedCategory>
): void {
    // Preserve canonical order so the stored value is stable.
    const ordered = ALL_FEED_CATEGORIES.filter((c) => values.has(c));
    writeString(FEED_HIDDEN_KEY, ordered.join(","));
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

// Showcase mode — blurs ALL media (images, video, and the inline
// background-image avatars) app-wide so the UI chrome can be captured
// for docs/streaming without exposing library content. Useful for
// README screenshots (GitHub's content policy bars explicit media) and
// as a privacy guard when screen-sharing. Pure CSS: App.tsx toggles a
// `binge-showcase-blur` class on <html> when this is on; the blur rule
// lives in styles/global.css. Off by default.
export function useShowcaseBlur(): boolean {
    return useStoredBool(SHOWCASE_BLUR_KEY, false);
}
export function readShowcaseBlur(): boolean {
    return readBool(SHOWCASE_BLUR_KEY, false);
}
export function setShowcaseBlur(value: boolean): void {
    writeBool(SHOWCASE_BLUR_KEY, value);
}
// Imperative toggle for the global `|` (Shift+\) capture hotkey in App.tsx.
export function toggleShowcaseBlur(): void {
    writeBool(SHOWCASE_BLUR_KEY, !readBool(SHOWCASE_BLUR_KEY, false));
}

// Demo mode — replaces the real Stash library with fictional, SFW
// placeholder content (procedural gradients + invented performers /
// scenes / tags / collections) for capturing marketing footage. Read as
// a React hook (settings UI / App) AND imperatively from the query layer
// (src/api/queries.ts), which runs outside React. Off by default.
export function useDemoMode(): boolean {
    return useStoredBool(DEMO_MODE_KEY, false);
}
export function readDemoMode(): boolean {
    return readBool(DEMO_MODE_KEY, false);
}
export function setDemoMode(value: boolean): void {
    writeBool(DEMO_MODE_KEY, value);
}

// binge-server URL. Read both as a React hook and via the imperative
// reader below (used by src/api/bingeServer.ts inside async fetches).
export function useBingeServerUrl(): string {
    return useStoredFreeString(BINGE_SERVER_URL_KEY, DEFAULT_BINGE_SERVER_URL);
}
export function readBingeServerUrl(): string {
    return readFreeString(BINGE_SERVER_URL_KEY, DEFAULT_BINGE_SERVER_URL);
}

// ── forage integration ──────────────────────────────────────────────
// "Send to forage" on a discovery card POSTs the StashDB scene to the
// forage daemon's watchlist. Needs the daemon's base URL and (when the
// daemon has auth enabled) an API token. Empty URL = feature disabled
// (the menu item nudges the user to Settings). Read both as hooks (for
// the Settings UI) and imperatively from src/api/forageServer.ts.
const FORAGE_URL_KEY = "binge.forageUrl";
const FORAGE_TOKEN_KEY = "binge.forageToken";
const FORAGE_WATCH_TARGET_KEY = "binge.forageWatchTarget";

// Quality the watch waits for. Mirrors forage's WatchTarget enum minus
// 480p (no one watches for a 480p copy). "any" = grab-ready as soon as
// any release appears.
export type ForageWatchTarget = "any" | "720p" | "1080p" | "4k";
export const ALLOWED_FORAGE_TARGETS: ReadonlyArray<ForageWatchTarget> = [
    "any",
    "720p",
    "1080p",
    "4k",
];
const DEFAULT_FORAGE_TARGET: ForageWatchTarget = "any";

export function useForageUrl(): string {
    return useStoredFreeString(FORAGE_URL_KEY, "");
}
export function readForageUrl(): string {
    return readFreeString(FORAGE_URL_KEY, "");
}
export function setForageUrl(value: string): void {
    // Strip trailing slash so path concatenation stays predictable.
    writeString(FORAGE_URL_KEY, value.trim().replace(/\/+$/, ""));
}

export function useForageToken(): string {
    return useStoredFreeString(FORAGE_TOKEN_KEY, "");
}
export function readForageToken(): string {
    return readFreeString(FORAGE_TOKEN_KEY, "");
}
export function setForageToken(value: string): void {
    writeString(FORAGE_TOKEN_KEY, value.trim());
}

export function useForageWatchTarget(): ForageWatchTarget {
    return useStoredString(
        FORAGE_WATCH_TARGET_KEY,
        DEFAULT_FORAGE_TARGET,
        ALLOWED_FORAGE_TARGETS
    );
}
export function readForageWatchTarget(): ForageWatchTarget {
    return readString(
        FORAGE_WATCH_TARGET_KEY,
        DEFAULT_FORAGE_TARGET,
        ALLOWED_FORAGE_TARGETS
    );
}
export function setForageWatchTarget(value: ForageWatchTarget): void {
    if (!ALLOWED_FORAGE_TARGETS.includes(value)) return;
    writeString(FORAGE_WATCH_TARGET_KEY, value);
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
