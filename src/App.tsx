import React, { useEffect, useRef, useState } from "react";
import { Reel } from "./components/Reel";
import { FilterProvider, useFilter } from "./filter/FilterContext";
import { FilterBar } from "./filter/FilterBar";
import { TabBar } from "./tabs/TabBar";
import { BingeLogo } from "./components/BingeLogo";
import { BottomNav } from "./components/BottomNav";
import { useIsMobile } from "./hooks/useIsMobile";
import { TabProvider, useTab } from "./tabs/TabContext";
import { Home } from "./tabs/Home";
import { Following } from "./tabs/Following";
import { Explore } from "./tabs/Explore";
import { SavedPage } from "./tabs/SavedPage";
import { MenuPage } from "./tabs/MenuPage";
import { SettingsPage } from "./tabs/SettingsPage";
import { PerformerProfileProvider } from "./performer/PerformerProfileContext";
import { PerformerProfile } from "./performer/PerformerProfile";
import { StoryViewerProvider } from "./home/StoryViewerContext";
import { ScribeProvider } from "./scribe/ScribeContext";
import { StoryViewer } from "./home/StoryViewer";
import { FilterSheet } from "./filter/FilterSheet";
import { DebugOverlay } from "./debug/DebugOverlay";
import {
    toggleShowDebug,
    useRefractIntegration,
    useShowDebug,
} from "./home/pluginSettings";
import { PluginProvider } from "./plugins/PluginContext";

// Stash exposes its API at window.PluginApi when this app is loaded as a
// plugin asset. Inside the popup-served reel SPA it's NOT available —
// the popup opens with `noopener,noreferrer` so we can't reach back into
// the Stash SPA's DOM directly. Refract detection therefore goes via
// localStorage, which IS shared (same-origin):
//
// Refract publishes its currently-resolved accent variables to
// localStorage on every accent change (see refract.js
// `broadcastAccentToPlugins()`) under these keys:
//
//     mv.theme.accent      → hex (#f97316)
//     mv.theme.accentBright → hex
//     mv.theme.accentTint  → hex
//     mv.theme.accentRgb   → "r, g, b" comma triple
//
// (The "mv.theme.*" prefix is for legacy reasons — the contract was
// first established for the multiview player; refract broadcasts to
// any same-origin plugin that wants in.)
//
// If those keys exist, refract is loaded — we flag refractActive +
// inject the values onto our root element as inline CSS variables so
// the bundled rgba(var(--accent-rgb), …) rules pick up refract's
// colour instead of binge's orange fallback.
declare global {
    interface Window {
        PluginApi?: unknown;
    }
}

interface RefractTheme {
    accent: string;       // hex like "#f97316"
    accentBright: string; // hex
    accentTint: string;   // hex
    accentRgb: string;    // "r, g, b"
}

function readRefractTheme(): RefractTheme | null {
    try {
        const accent = localStorage.getItem("mv.theme.accent");
        const accentRgb = localStorage.getItem("mv.theme.accentRgb");
        if (!accent || !accentRgb) return null;
        return {
            accent,
            accentBright: localStorage.getItem("mv.theme.accentBright") || accent,
            accentTint: localStorage.getItem("mv.theme.accentTint") || accent,
            accentRgb,
        };
    } catch {
        return null;
    }
}

function App() {
    const refractEnabled = useRefractIntegration();
    const [refractTheme, setRefractTheme] = useState<RefractTheme | null>(
        () => readRefractTheme()
    );

    // Re-read on `storage` events so a user changing refract's accent
    // in the Stash settings panel updates the open binge tab live.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (!e.key || !e.key.startsWith("mv.theme.")) return;
            setRefractTheme(readRefractTheme());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // The class + inline vars only flow when the user has explicitly
    // opted in via Settings. Default is OFF so binge ships with a
    // consistent native palette regardless of whether refract is
    // installed.
    const refractActive = refractEnabled && refractTheme !== null;
    const activeTheme = refractActive ? refractTheme : null;

    // Global \ hotkey toggles the debug overlay. Ignored when the user
    // is typing into an input — we don't want a stray backslash in a
    // filter search box to flash the overlay.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "\\") return;
            const t = e.target;
            if (t instanceof HTMLElement) {
                if (
                    t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.isContentEditable
                ) {
                    return;
                }
            }
            e.preventDefault();
            toggleShowDebug();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <PluginProvider>
            <FilterProvider>
                <TabProvider>
                    <PerformerProfileProvider>
                        <StoryViewerProvider>
                            <ScribeProvider>
                            <div
                                className={
                                    refractActive
                                        ? "binge-app refract"
                                        : "binge-app"
                                }
                                // Inline overrides for refract's accent
                                // tokens — flows through every existing
                                // rgba(var(--accent-rgb), …) rule in
                                // global.css without needing to rewrite
                                // any of them.
                                style={
                                    activeTheme
                                        ? ({
                                              "--accent": activeTheme.accent,
                                              "--accent-bright":
                                                  activeTheme.accentBright,
                                              "--accent-tint":
                                                  activeTheme.accentTint,
                                              "--accent-rgb":
                                                  activeTheme.accentRgb,
                                          } as React.CSSProperties)
                                        : undefined
                                }
                            >
                                <TopHeader />
                                <TabContent />
                                <MobileBottomNav />
                            </div>
                            <PerformerProfile />
                            <StoryViewer />
                            <DebugMaybe />
                            <FilterAutoClear />
                            </ScribeProvider>
                        </StoryViewerProvider>
                    </PerformerProfileProvider>
                </TabProvider>
            </FilterProvider>
        </PluginProvider>
    );
}

// Single top strip: shared gradient backdrop for both the tab nav and any
// active filter chips. Visibility (auto-hide on scroll-down) is driven by
// TabContext.tabBarVisible — both layers fade together so we never get a
// half-hidden header. When the active tab is "home", a burger menu also
// floats at the right edge of the tab-nav row — entry point to the
// Saved and Settings pages.
//
// Hidden tabs (saved / settings) have their own back-button header and
// don't want a competing nav on top — skip the TopHeader entirely on
// those routes.
function TopHeader() {
    const { tab, tabBarVisible } = useTab();
    const isMobile = useIsMobile();
    if (tab === "saved" || tab === "settings" || tab === "menu") return null;
    // On mobile the bottom nav owns tab navigation — the top strip
    // hides entirely. A floating For-You filter gear renders below
    // when needed. Saved + Settings are now reached via the bottom
    // nav's burger slot → the "More" page → those entries.
    if (isMobile) return <MobileFloatingControls />;
    return (
        <header
            className={
                "binge-top-header" + (tabBarVisible ? "" : " is-hidden")
            }
        >
            <BingeLogo className="binge-header-brand" title="binge" />
            <TabBar />
            <FilterBar />
            {tab === "home" && <HomeBurger />}
            {tab === "foryou" && <ForYouFilterBtn />}
        </header>
    );
}

// Mobile-only: the For You filter gear stays accessible as a
// floating top-right button since the TopHeader it normally lives
// in is hidden at narrow viewports. Reuses tabBarVisible so the
// gear auto-hides on scroll-down + reappears on scroll-up —
// matches the bottom nav's behaviour so they feel like a single
// chrome layer fading in/out together.
function MobileFloatingControls() {
    const { tab, tabBarVisible } = useTab();
    if (tab !== "foryou") return null;
    return (
        <div
            className={
                "binge-mobile-floating" + (tabBarVisible ? "" : " is-hidden")
            }
        >
            <ForYouFilterBtn />
        </div>
    );
}

// Render the BottomNav only when we're on mobile. Kept as a sibling
// of TabContent (not nested inside) so it stays out of any scroll
// container — fixed positioning + flat z-index is enough.
function MobileBottomNav() {
    const isMobile = useIsMobile();
    if (!isMobile) return null;
    return <BottomNav />;
}

// Filter-preferences icon for the For You reel — opens a bottom sheet
// listing saved presets, active chips, and a "save current" form.
function ForYouFilterBtn() {
    const [open, setOpen] = useState(false);
    return (
        <div className="binge-home-burger">
            <button
                type="button"
                className="binge-home-burger-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
                aria-label="Open filter"
                aria-haspopup="dialog"
                title="Filter"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <line x1="4" y1="6" x2="14" y2="6" />
                    <line x1="18" y1="6" x2="20" y2="6" />
                    <circle cx="16" cy="6" r="2" />
                    <line x1="4" y1="12" x2="8" y2="12" />
                    <line x1="12" y1="12" x2="20" y2="12" />
                    <circle cx="10" cy="12" r="2" />
                    <line x1="4" y1="18" x2="16" y2="18" />
                    <line x1="20" y1="18" x2="20" y2="18" />
                    <circle cx="18" cy="18" r="2" />
                </svg>
            </button>
            {open && <FilterSheet onClose={() => setOpen(false)} />}
        </div>
    );
}

// Burger menu — rendered as a TopHeader overlay so it lives on the
// tab-nav row regardless of page scroll position. State is local
// (open/closed); outside-click dismisses.
function HomeBurger() {
    const { setTab } = useTab();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const onClick = () => setOpen(false);
        const id = window.requestAnimationFrame(() => {
            window.addEventListener("click", onClick);
        });
        return () => {
            window.cancelAnimationFrame(id);
            window.removeEventListener("click", onClick);
        };
    }, [open]);
    return (
        <div className="binge-home-burger">
            <button
                type="button"
                className="binge-home-burger-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={open}
                title="Menu"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
            </button>
            {open && (
                <div
                    className="binge-home-menu"
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        className="binge-home-menu-item"
                        onClick={() => {
                            setOpen(false);
                            setTab("saved");
                        }}
                        role="menuitem"
                    >
                        <span className="binge-home-menu-icon">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                            </svg>
                        </span>
                        <span className="binge-home-menu-label">Saved</span>
                    </button>
                    <button
                        type="button"
                        className="binge-home-menu-item"
                        onClick={() => {
                            setOpen(false);
                            setTab("settings");
                        }}
                        role="menuitem"
                    >
                        <span className="binge-home-menu-icon">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                width="18"
                                height="18"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.91 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                            </svg>
                        </span>
                        <span className="binge-home-menu-label">
                            Settings
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}

// Active tab content. The reel only fetches based on whatever filter
// context the For You / Explore entry points have set; there's no
// per-tab filter UI. (Following is a performer grid, not a reel
// trigger.)
// Tabs are kept mounted via display:none toggling rather than
// conditional rendering, so swapping back to a tab doesn't refire its
// useEffects, refetch data, rebuild virtualizers, or re-mount
// <video>/IO machinery. Each tab's data fetches happen ONCE per
// session — the perf footprint is otherwise dominated by those.
//
// The Reel is the exception: it's heavy by nature and its content
// depends on entry-driven state (reelMode, pin, sortSeed, sceneFilter)
// that's meant to RESET on each entry. Letting it unmount/remount is
// correct here.
function TabContent() {
    const { tab, reelMode } = useTab();
    const reelVisible =
        tab === "foryou" || (tab === "explore" && reelMode === "chained");
    return (
        <>
            <div
                className={
                    "binge-tab-pane" +
                    (tab === "home" ? " is-active" : " is-hidden")
                }
            >
                <Home />
            </div>
            <div
                className={
                    "binge-tab-pane" +
                    (tab === "following" ? " is-active" : " is-hidden")
                }
            >
                <Following />
            </div>
            <div
                className={
                    "binge-tab-pane" +
                    (tab === "explore" && reelMode === "random"
                        ? " is-active"
                        : " is-hidden")
                }
            >
                <Explore />
            </div>
            {tab === "saved" && (
                <div className="binge-tab-pane is-active">
                    <SavedPage />
                </div>
            )}
            {tab === "settings" && (
                <div className="binge-tab-pane is-active">
                    <SettingsPage />
                </div>
            )}
            {tab === "menu" && (
                <div className="binge-tab-pane is-active">
                    <MenuPage />
                </div>
            )}
            {reelVisible && (
                <div className="binge-tab-pane is-active">
                    <Reel />
                </div>
            )}
        </>
    );
}

// Gates the debug overlay on the plugin-settings toggle. Wrapping it in
// a tiny component (rather than inlining in App) means the hook is
// scoped here and the overlay's polling interval only spins up when
// the user has actually turned it on.
function DebugMaybe() {
    const enabled = useShowDebug();
    if (!enabled) return null;
    return <DebugOverlay />;
}

// Auto-clear the filter chips when the user leaves the For You tab.
// Filter state is global, but the chips are conceptually scoped to
// the reel — re-entering For You from elsewhere should land on a
// clean random feed, not whatever filter the user had set last time.
// Lives inside both providers (Filter + Tab) so it can read/clear.
function FilterAutoClear() {
    const { tab } = useTab();
    const { clear } = useFilter();
    const prevTabRef = useRef(tab);
    useEffect(() => {
        if (prevTabRef.current === "foryou" && tab !== "foryou") {
            clear();
        }
        prevTabRef.current = tab;
    }, [tab, clear]);
    return null;
}

export default App;
