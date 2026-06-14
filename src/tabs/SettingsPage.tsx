import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTab } from "./TabContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";
import {
    ALLOWED_FORAGE_TARGETS,
    ALLOWED_LOOKBACK_DAYS,
    ALLOWED_TRANSCODE,
    setAllowedGenders,
    setBingeServerUrl,
    setForageUrl,
    setForageWatchTarget,
    setIncludeReddit,
    setIncludeStashDB,
    setIncludeStashDBInProfile,
    setLookbackDays,
    setRefractIntegration,
    setShowDebug,
    setShowGalleries,
    setShowcaseBlur,
    setDemoMode,
    setTranscodeType,
    useAllowedGenders,
    useBingeServerUrl,
    useForageUrl,
    useForageWatchTarget,
    useIncludeReddit,
    useIncludeStashDB,
    useIncludeStashDBInProfile,
    useLookbackDays,
    useRefractIntegration,
    useShowDebug,
    useShowGalleries,
    useShowcaseBlur,
    useDemoMode,
    useTranscodeType,
    type ForageWatchTarget,
    type Gender,
} from "../home/pluginSettings";
import {
    getBingeServerConfig,
    getBingeServerHealth,
    setBingeServerConfig,
    type BingeServerConfigState,
    type BingeServerHealth,
} from "../api/bingeServer";
import { getForageHealth } from "../api/forageServer";
import { fetchStashApiKey } from "../api/queries";

// In-app settings page — all preferences that used to live in Stash's
// plugin settings UI now live here. Same localStorage keys + pubsub,
// so any change here propagates to open Reel slides immediately.
export function SettingsPage() {
    const { setTab } = useTab();
    const scrollRef = useRef<HTMLDivElement>(null);
    useAutoHideTabBar(scrollRef);

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <header className="binge-saved-header">
                <button
                    type="button"
                    className="binge-saved-back"
                    onClick={() => setTab("home")}
                    aria-label="Back to Home"
                    title="Back"
                >
                    <ChevronLeft />
                </button>
                <h1 className="binge-saved-title">Settings</h1>
                <span className="binge-saved-spacer" />
            </header>

            <div className="binge-settings-list">
                <GenderRow />
                <TranscodeRow />
                <GalleriesRow />
                <LookbackRow />
                <StashDBRow />
                <StashDBProfileRow />
                <RedditRow />
                <BingeServerRow />
                <BingeServerConfigCard />
                <ForageUrlRow />
                <ForageTargetRow />
                <RefractRow />
                <ShowcaseRow />
                <DemoRow />
                <DebugRow />
            </div>
        </div>
    );
}

// ── Individual setting rows ──────────────────────────────────────────

function TranscodeRow() {
    const value = useTranscodeType();
    return (
        <SettingRow
            title="Stream type"
            description="How videos are delivered to the binge reel. Auto follows Stash's transcode rules. Direct skips transcoding (best for already-compatible formats). MP4/WebM force a transcoded output. HLS uses chunked streaming."
        >
            <select
                className="binge-settings-select"
                value={value}
                onChange={(e) =>
                    setTranscodeType(
                        e.target.value as (typeof ALLOWED_TRANSCODE)[number]
                    )
                }
            >
                <option value="auto">Auto (Stash decides)</option>
                <option value="direct">Direct (no transcode)</option>
                <option value="mp4">Transcoded MP4</option>
                <option value="webm">Transcoded WebM</option>
                <option value="hls">HLS streaming</option>
            </select>
        </SettingRow>
    );
}

function GenderRow() {
    const allowed = useAllowedGenders();
    const toggle = (g: Gender) => {
        const next = new Set(allowed);
        if (next.has(g)) next.delete(g);
        else next.add(g);
        setAllowedGenders(next);
    };
    return (
        <SettingRow
            title="Genders to surface"
            description="Performers of these genders appear on the Home discovery feed and Explore's Discover Performers row. Defaults to female + trans female; toggle others to broaden the surface."
        >
            <div
                className="binge-settings-gender-row"
                role="group"
                aria-label="Genders to surface"
            >
                {GENDER_OPTIONS.map(({ value, label }) => {
                    const active = allowed.has(value);
                    return (
                        <button
                            key={value}
                            type="button"
                            className={
                                "binge-settings-gender-btn" +
                                (active ? " is-active" : "")
                            }
                            onClick={() => toggle(value)}
                            title={label}
                            aria-label={label}
                            aria-pressed={active}
                        >
                            <GenderIcon gender={value} />
                        </button>
                    );
                })}
            </div>
        </SettingRow>
    );
}

const GENDER_OPTIONS: ReadonlyArray<{
    value: Gender;
    label: string;
}> = [
    { value: "FEMALE", label: "Female" },
    { value: "MALE", label: "Male" },
    { value: "TRANSGENDER_FEMALE", label: "Trans female" },
    { value: "TRANSGENDER_MALE", label: "Trans male" },
    { value: "NON_BINARY", label: "Non-binary" },
];

// Hand-drawn gender glyphs that scale crisply at small sizes —
// the corresponding Unicode characters render unevenly across
// fonts at 18-20px, so we paint our own. All share a 24×24 box,
// 1.8 stroke, round line caps. `currentColor` so the buttons can
// theme via the parent's `color`.
function GenderIcon({ gender }: { gender: Gender }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {gender === "FEMALE" && (
                <g>
                    <circle cx="12" cy="9" r="4.5" />
                    <path d="M12 13.5 v7" />
                    <path d="M9 17.5 h6" />
                </g>
            )}
            {gender === "MALE" && (
                <g>
                    <circle cx="10" cy="14" r="4.5" />
                    <path d="M13.2 10.8 L20 4" />
                    <path d="M14 4 H20 V10" />
                </g>
            )}
            {gender === "TRANSGENDER_FEMALE" && (
                // Venus + a small arrow sprouting from upper-left of
                // the circle (the standard trans-modifier stroke).
                <g>
                    <circle cx="12" cy="11" r="4" />
                    <path d="M12 15 v6" />
                    <path d="M9.5 18.5 h5" />
                    <path d="M9.1 8.1 L5 4" />
                    <path d="M5 4 H8.5 M5 4 V7.5" />
                </g>
            )}
            {gender === "TRANSGENDER_MALE" && (
                // Mars + a perpendicular stroke across the diagonal
                // arrow shaft — mirrors the trans-male glyph (U+26A6).
                <g>
                    <circle cx="10" cy="14" r="4" />
                    <path d="M12.8 11.2 L20 4" />
                    <path d="M14 4 H20 V10" />
                    <path d="M14.5 9.5 L17.5 12.5" />
                </g>
            )}
            {gender === "NON_BINARY" && (
                // Single vertical stem with a circle in the middle —
                // matches the contemporary NB symbol (a Venus-like
                // shape with no cross or arrow).
                <g>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 3 V8" />
                    <path d="M12 16 V21" />
                </g>
            )}
        </svg>
    );
}
function GalleriesRow() {
    const value = useShowGalleries();
    return (
        <SettingRow
            title="Show galleries in feed"
            description="Mix gallery posts (photo sets) into the Home feed alongside scenes. Disable to see scenes only."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setShowGalleries(v)}
                label="Show galleries"
            />
        </SettingRow>
    );
}

function LookbackRow() {
    const value = useLookbackDays();
    return (
        <SettingRow
            title="Recent window"
            description='How far back "new" looks on the Home tab. Affects both the stories row and the initial feed load. Shorter windows feel tighter; longer windows surface more content but slow first-load on heavy libraries.'
        >
            <select
                className="binge-settings-select"
                value={String(value)}
                onChange={(e) => setLookbackDays(parseInt(e.target.value, 10))}
            >
                {ALLOWED_LOOKBACK_DAYS.map((days) => (
                    <option key={days} value={String(days)}>
                        {lookbackLabel(days)}
                    </option>
                ))}
            </select>
        </SettingRow>
    );
}

function StashDBRow() {
    const value = useIncludeStashDB();
    return (
        <SettingRow
            title="Include StashDB new releases in stories"
            description="Stories row also surfaces new releases on StashDB for performers in your library that you don't already own. Requires a StashDB API key in Stash → Settings → Metadata Providers → StashBox. Results cached for 12h."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setIncludeStashDB(v)}
                label="StashDB"
            />
        </SettingRow>
    );
}

function StashDBProfileRow() {
    const value = useIncludeStashDBInProfile();
    return (
        <SettingRow
            title="Mix StashDB scenes into performer profiles"
            description="When viewing a library performer's profile, also surface scenes from their StashDB catalogue that you don't already own — interleaved with your library scenes by date. Tapping a StashDB-only scene opens the same add-to-library modal as the discovery feed."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setIncludeStashDBInProfile(v)}
                label="StashDB in profiles"
            />
        </SettingRow>
    );
}

function RedditRow() {
    const value = useIncludeReddit();
    return (
        <SettingRow
            title="Include Reddit posts in stories"
            description="Stories row surfaces new Reddit submissions from performers whose profile has a reddit.com URL. Requires binge-server running (set the URL below) and a configured script-app on reddit.com. Daemon-off cleanly no-ops."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setIncludeReddit(v)}
                label="Reddit"
            />
        </SettingRow>
    );
}

function BingeServerRow() {
    const stored = useBingeServerUrl();
    // Local edit buffer so typing doesn't trigger pubsub on every
    // keystroke. We commit on blur (and resync if the user changes
    // the value in another tab via the storage event).
    const [draft, setDraft] = useState(stored);
    useEffect(() => {
        setDraft(stored);
    }, [stored]);

    return (
        <SettingRow
            title="binge-server URL"
            description="HTTP address of the binge-server daemon. Default is http://localhost:7878 — change it if you run binge-server on a different host or port. Status dot pings /healthz."
        >
            <div className="binge-settings-url-row">
                <input
                    type="text"
                    className="binge-settings-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                        if (draft !== stored) setBingeServerUrl(draft);
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="http://localhost:7878"
                />
                <BingeServerHealthDot url={stored} />
            </div>
        </SettingRow>
    );
}

// Pings /healthz on mount + whenever the configured URL changes.
// Three-state: pending (grey) / ok (green) / unreachable (red).
function BingeServerHealthDot({ url }: { url: string }) {
    const [state, setState] = useState<"pending" | "ok" | "down">("pending");
    useEffect(() => {
        let alive = true;
        setState("pending");
        getBingeServerHealth()
            .then((h) => {
                if (!alive) return;
                setState(h && h.ok ? "ok" : "down");
            })
            .catch(() => {
                if (!alive) return;
                setState("down");
            });
        return () => {
            alive = false;
        };
    }, [url]);

    const label =
        state === "ok"
            ? "binge-server reachable"
            : state === "down"
              ? "binge-server unreachable"
              : "Checking…";
    return (
        <span
            className={`binge-settings-status-dot is-${state}`}
            title={label}
            aria-label={label}
            role="status"
        />
    );
}

// binge-server live config card. Shows daemon health, auto-pushes the
// Stash API key on first contact, and exposes a Reddit-cookie input
// so cookie rotation can happen entirely from the binge UI.
//
// Three visible states:
//   - "unreachable" → daemon down; show a setup link, no fields
//   - "needs config" → daemon up, missing creds; show inputs
//   - "all set"     → daemon up + configured; show status + last poll
//
// The Stash API key fetch is silent — binge calls
// `fetchStashApiKey()` (same-origin Stash GraphQL) and POSTs it to
// /config the first time the daemon comes up without one. The user
// never sees that step.
function BingeServerConfigCard() {
    const url = useBingeServerUrl();
    const [health, setHealth] = useState<BingeServerHealth | null | "pending">(
        "pending"
    );
    const [config, setConfig] = useState<BingeServerConfigState | null>(null);
    const [cookieInput, setCookieInput] = useState("");
    const [cookieBusy, setCookieBusy] = useState(false);
    const [cookieError, setCookieError] = useState<string | null>(null);
    const [cookieSaved, setCookieSaved] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // Poll health + config on mount + URL change.
    useEffect(() => {
        let alive = true;
        setHealth("pending");
        setConfig(null);
        setCookieError(null);
        setCookieSaved(false);
        (async () => {
            const [h, c] = await Promise.all([
                getBingeServerHealth(),
                getBingeServerConfig(),
            ]);
            if (!alive) return;
            setHealth(h);
            setConfig(c);
        })();
        return () => {
            alive = false;
        };
    }, [url]);

    // Silent auto-push of the Stash API key whenever the daemon is
    // reachable but doesn't have one. Fetch from Stash same-origin →
    // POST to binge-server → refresh local config state.
    useEffect(() => {
        if (config === null) return;
        if (config.stashApiKeySet) return;
        let alive = true;
        (async () => {
            try {
                const apiKey = await fetchStashApiKey();
                if (!alive || !apiKey) return;
                const stashUrl = window.location.origin;
                const result = await setBingeServerConfig({
                    stashUrl,
                    stashApiKey: apiKey,
                });
                if (!alive) return;
                if (result.ok) {
                    const refreshed = await getBingeServerConfig();
                    if (alive) setConfig(refreshed);
                }
            } catch (err) {
                console.warn("[binge] auto-push Stash API key failed", err);
            }
        })();
        return () => {
            alive = false;
        };
    }, [config]);

    const handleSaveCookie = async () => {
        const cookie = cookieInput.trim();
        if (!cookie) return;
        setCookieBusy(true);
        setCookieError(null);
        setCookieSaved(false);
        const result = await setBingeServerConfig({
            redditSessionCookie: cookie,
        });
        if (result.ok) {
            setCookieSaved(true);
            setCookieInput("");
            const refreshed = await getBingeServerConfig();
            setConfig(refreshed);
        } else {
            setCookieError(result.error);
        }
        setCookieBusy(false);
    };

    if (health === "pending") {
        return (
            <div className="binge-settings-card">
                <div className="binge-settings-card-header">
                    <h3 className="binge-settings-card-title">
                        binge-server configuration
                    </h3>
                    <span className="binge-settings-card-status">
                        <span className="binge-settings-status-dot is-pending" />
                        Checking…
                    </span>
                </div>
            </div>
        );
    }

    if (health === null) {
        return (
            <div className="binge-settings-card is-disconnected">
                <div className="binge-settings-card-header">
                    <h3 className="binge-settings-card-title">
                        binge-server configuration
                    </h3>
                    <span className="binge-settings-card-status">
                        <span className="binge-settings-status-dot is-down" />
                        Unreachable
                    </span>
                </div>
                <p className="binge-settings-card-description">
                    Daemon unreachable at <code>{url}</code>. Reddit
                    stories will be silently skipped until it's running.{" "}
                    <a
                        href="https://github.com/ordureconnoisseur/binge-server"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="binge-settings-card-link"
                    >
                        Set up binge-server →
                    </a>
                </p>
            </div>
        );
    }

    // Daemon is reachable — render the full config card.
    const stashKeyState = config?.stashApiKeySet
        ? "✓ Auto-detected"
        : "Setting up…";
    const cookieIsSet = !!config?.redditCookieSet;

    return (
        <div className="binge-settings-card">
            <div className="binge-settings-card-header">
                <h3 className="binge-settings-card-title">
                    binge-server configuration
                </h3>
                <span className="binge-settings-card-status">
                    <span className="binge-settings-status-dot is-ok" />
                    Connected
                    {health.lastPoll && (
                        <span className="binge-settings-card-status-meta">
                            · {health.performerCount} performers ·{" "}
                            last poll {formatRelative(health.lastPoll)}
                        </span>
                    )}
                </span>
            </div>
            <p className="binge-settings-card-description">
                Credentials the daemon uses to poll Reddit on your
                behalf. The Stash API key is filled in automatically; the
                Reddit session cookie has to be pasted (it lives in your
                browser, not in Stash).
            </p>

            <div className="binge-settings-card-field">
                <span className="binge-settings-card-field-label">
                    Stash API key
                </span>
                <span className="binge-settings-card-field-value">
                    {stashKeyState}
                </span>
            </div>

            <div className="binge-settings-card-field is-stacked">
                <span className="binge-settings-card-field-label">
                    Reddit session cookie
                </span>
                <div className="binge-server-config-cookie-row">
                    <input
                        type="password"
                        className="binge-settings-input"
                        value={cookieInput}
                        onChange={(e) => {
                            setCookieInput(e.target.value);
                            setCookieSaved(false);
                            setCookieError(null);
                        }}
                        placeholder={
                            cookieIsSet
                                ? "✓ Set · paste a new value to rotate"
                                : "Paste your reddit_session value"
                        }
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        disabled={cookieBusy}
                    />
                    <button
                        type="button"
                        className="binge-server-config-cookie-save"
                        onClick={() => void handleSaveCookie()}
                        disabled={cookieBusy || !cookieInput.trim()}
                    >
                        {cookieBusy ? "Saving…" : "Save"}
                    </button>
                </div>
                {cookieError && (
                    <p className="binge-server-config-error">
                        {cookieError}
                    </p>
                )}
                {cookieSaved && (
                    <p className="binge-server-config-ok">Saved ✓</p>
                )}
                <button
                    type="button"
                    className="binge-server-config-help-toggle"
                    onClick={() => setShowHelp((v) => !v)}
                >
                    {showHelp ? "▾" : "▸"} How to find your Reddit cookie
                </button>
                {showHelp && (
                    <ol className="binge-server-config-help">
                        <li>
                            In a regular browser tab, log into
                            reddit.com.
                        </li>
                        <li>
                            Open DevTools (F12) → Application → Cookies
                            → https://www.reddit.com
                        </li>
                        <li>
                            Find the row named{" "}
                            <code>reddit_session</code> and copy its
                            Value column (a long JWT-looking string).
                            Paste it above.
                        </li>
                        <li>
                            Cookies expire every few months. When
                            stories stop updating, repeat steps 1–3.
                        </li>
                    </ol>
                )}
            </div>
        </div>
    );
}

// Compact relative-time formatter: "2 min ago", "3 h ago", "yesterday".
function formatRelative(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "—";
    const diffMs = Date.now() - t;
    const secs = Math.floor(diffMs / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return `${days} d ago`;
}

// ── forage integration rows ─────────────────────────────────────────
// "Send to forage" on a discovery card adds that StashDB scene to the
// forage daemon's watchlist. These rows point binge at the daemon.

function ForageUrlRow() {
    const stored = useForageUrl();
    const [draft, setDraft] = useState(stored);
    useEffect(() => {
        setDraft(stored);
    }, [stored]);

    return (
        <SettingRow
            title="forage server URL"
            description='Base URL of your forage daemon (e.g. https://forage.tailf01ca.ts.net). "Send to forage" appears on discovery scenes once this daemon is reachable. Authentication is automatic — binge presents your Stash API key, which forage already trusts; nothing to paste. Status dot pings /healthz.'
        >
            <div className="binge-settings-url-row">
                <input
                    type="text"
                    className="binge-settings-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                        if (draft !== stored) setForageUrl(draft);
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder="https://forage.example.ts.net"
                />
                <ForageHealthDot url={stored} />
            </div>
        </SettingRow>
    );
}

// Pings forage /healthz on mount + whenever the URL changes.
function ForageHealthDot({ url }: { url: string }) {
    const [state, setState] = useState<"pending" | "ok" | "down" | "idle">(
        url ? "pending" : "idle"
    );
    useEffect(() => {
        if (!url) {
            setState("idle");
            return;
        }
        let alive = true;
        setState("pending");
        getForageHealth()
            .then((h) => {
                if (!alive) return;
                setState(h && h.ok ? "ok" : "down");
            })
            .catch(() => {
                if (alive) setState("down");
            });
        return () => {
            alive = false;
        };
    }, [url]);

    if (state === "idle") return null;
    const label =
        state === "ok"
            ? "forage reachable"
            : state === "down"
              ? "forage unreachable"
              : "Checking…";
    return (
        <span
            className={`binge-settings-status-dot is-${state}`}
            title={label}
            aria-label={label}
            role="status"
        />
    );
}

function ForageTargetRow() {
    const value = useForageWatchTarget();
    return (
        <SettingRow
            title="forage watch quality"
            description='When you send a scene to forage, this is the quality it waits for before flagging a release ready to grab. "Any" surfaces the first release of any resolution.'
        >
            <select
                className="binge-settings-select"
                value={value}
                onChange={(e) =>
                    setForageWatchTarget(e.target.value as ForageWatchTarget)
                }
            >
                {ALLOWED_FORAGE_TARGETS.map((t) => (
                    <option key={t} value={t}>
                        {t === "any" ? "Any release" : t}
                    </option>
                ))}
            </select>
        </SettingRow>
    );
}

function RefractRow() {
    const value = useRefractIntegration();
    return (
        <SettingRow
            title="Follow refract accent"
            description="If you also use the refract theme, binge's accent colour will match the refract accent you've picked in the Stash settings (orange / cyan / pink / yellow / purple / green / teal). Story rings keep Instagram's signature gradient regardless."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setRefractIntegration(v)}
                label="Follow refract accent"
            />
        </SettingRow>
    );
}

function ShowcaseRow() {
    const value = useShowcaseBlur();
    return (
        <SettingRow
            title="Showcase mode (blur all media)"
            description="Blurs every image, video, and avatar across binge while leaving the interface sharp — for screenshots, demo recordings, or screen-sharing without exposing library content. Nothing is uploaded or changed; it's a display-only filter applied in your browser. Hotkey: | (Shift + \\)"
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setShowcaseBlur(v)}
                label="Showcase blur"
            />
        </SettingRow>
    );
}

function DemoRow() {
    const value = useDemoMode();
    return (
        <SettingRow
            title="Demo content"
            description="Replace your library with fictional, SFW placeholder content (gradients + invented names) for capturing marketing footage — no real performers, scenes, or media are shown. Display-only; nothing in Stash changes."
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setDemoMode(v)}
                label="Demo content"
            />
        </SettingRow>
    );
}

function DebugRow() {
    const value = useShowDebug();
    return (
        <SettingRow
            title="Show debug overlay"
            description="Pin a small diagnostic panel showing mounted video count, JS heap, scroll/tab state, and recent GraphQL response times. Hotkey: \\"
        >
            <SwitchToggle
                checked={value}
                onChange={(v) => setShowDebug(v)}
                label="Debug overlay"
            />
        </SettingRow>
    );
}

// ── Building blocks ──────────────────────────────────────────────────

function SettingRow({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className="binge-settings-row">
            <div className="binge-settings-row-text">
                <h3 className="binge-settings-row-title">{title}</h3>
                <p className="binge-settings-row-description">{description}</p>
            </div>
            <div className="binge-settings-row-control">{children}</div>
        </div>
    );
}

function SwitchToggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
}) {
    return (
        <label className="binge-settings-switch" title={label}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                aria-label={label}
            />
            <span className="binge-settings-switch-track" aria-hidden="true">
                <span className="binge-settings-switch-thumb" />
            </span>
        </label>
    );
}

function lookbackLabel(days: number): string {
    if (days === 7) return "Last 7 days";
    if (days === 14) return "Last 14 days";
    if (days === 30) return "Last 30 days";
    if (days === 60) return "Last 60 days";
    if (days === 90) return "Last 90 days";
    return `Last ${days} days`;
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 18l-6-6 6-6" />
        </svg>
    );
}
