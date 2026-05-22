import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTab } from "./TabContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";
import {
    ALLOWED_LOOKBACK_DAYS,
    ALLOWED_TRANSCODE,
    setBingeServerUrl,
    setIncludeReddit,
    setIncludeStashDB,
    setLookbackDays,
    setShowDebug,
    setShowGalleries,
    setTranscodeType,
    useBingeServerUrl,
    useIncludeReddit,
    useIncludeStashDB,
    useLookbackDays,
    useShowDebug,
    useShowGalleries,
    useTranscodeType,
} from "../home/pluginSettings";
import { getBingeServerHealth } from "../api/bingeServer";

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
                <TranscodeRow />
                <GalleriesRow />
                <LookbackRow />
                <StashDBRow />
                <RedditRow />
                <BingeServerRow />
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
    if (days === 180) return "Last 6 months";
    if (days === 365) return "Last year";
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
