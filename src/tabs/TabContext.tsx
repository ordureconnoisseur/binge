import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

export type Tab =
    | "home"
    | "foryou"
    | "following"
    | "explore"
    | "saved"
    | "settings"
    | "menu";

// "random" — the existing reel behaviour: random sort + scene_filter chips.
// "chained" — recommendation chain seeded by an Explore-tile tap. The reel
// keeps a weighted context of recently-played performers/tags and picks
// next scenes that share attributes, with occasional random injections.
export type ReelMode = "random" | "chained";

interface TabContextValue {
    tab: Tab;
    setTab: (next: Tab) => void;
    // TabBar visibility. Tab content owns when this flips: each scrollable
    // view installs a scroll listener that toggles based on scrollTop. Reset
    // to true automatically on tab switch so a re-entered tab always shows
    // its bar first.
    tabBarVisible: boolean;
    setTabBarVisible: (next: boolean) => void;
    // One-shot "open the reel with this scene pinned to the first slide"
    // intent. Set by the performer profile when the user taps a scene
    // card; consumed and cleared by the Reel on its initial render.
    pinFirstSceneId: string | null;
    setPinFirstSceneId: (id: string | null) => void;
    // One-shot "open the reel with this fixed queue of scenes" intent.
    // When set, the reel renders exactly these scenes in this order,
    // starting at `startIndex`, with no pagination — the user can
    // swipe through the queue and bottoms out at the last scene.
    //
    // Used by PerformerSceneGrid (and other surfaces that have a
    // predetermined order) — gives the user a deterministic "play
    // these in order from here" experience, vs. pinFirstSceneId
    // which is "pin this then random-fill the rest of the filter".
    pinnedQueue: { ids: string[]; startIndex: number } | null;
    setPinnedQueue: (q: { ids: string[]; startIndex: number } | null) => void;
    // Active reel mode. "chained" is only ever set by an Explore tile
    // tap; any user-driven filter chip while in chained mode snaps it
    // back to "random". See [Reel.tsx] reset effect.
    reelMode: ReelMode;
    setReelMode: (next: ReelMode) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

// Hash-routing helpers. Stash plugins are served at a fixed asset
// path; we can't change the actual URL pathname, but we can use the
// hash fragment so the browser back/forward buttons work and so the
// URL bar reflects the active tab (e.g. .../index.html#/explore).
const HASH_TABS: ReadonlySet<Tab> = new Set<Tab>([
    "home",
    "foryou",
    "following",
    "explore",
    "saved",
    "settings",
    "menu",
]);

function readTabFromHash(): Tab | null {
    const raw = typeof window !== "undefined" ? window.location.hash : "";
    const match = raw.match(/^#\/([a-z]+)/);
    if (!match) return null;
    const slug = match[1] as Tab;
    return HASH_TABS.has(slug) ? slug : null;
}

function writeTabToHash(tab: Tab): void {
    if (typeof window === "undefined") return;
    const next = `#/${tab}`;
    if (window.location.hash === next) return;
    // pushState rather than replaceState so each tab change is a
    // history entry — that's the whole point: browser back/forward
    // navigates between tabs.
    window.history.pushState(null, "", next);
}

export function TabProvider({ children }: { children: ReactNode }) {
    const [tab, setTabRaw] = useState<Tab>(() => readTabFromHash() ?? "home");
    const [tabBarVisible, setTabBarVisible] = useState(true);
    const [pinFirstSceneId, setPinFirstSceneId] = useState<string | null>(null);
    const [pinnedQueue, setPinnedQueue] = useState<
        { ids: string[]; startIndex: number } | null
    >(null);
    const [reelMode, setReelMode] = useState<ReelMode>("random");

    // On first paint, make sure the hash reflects the resolved tab —
    // covers the case where no hash was set at load (default "home").
    useEffect(() => {
        writeTabToHash(tab);
        // Only on mount; subsequent setTab calls write the hash inline.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Browser back / forward → sync tab state. The `hashchange` event
    // fires when the user navigates history OR edits the URL bar. The
    // listener attaches ONCE for the lifetime of the provider — we
    // route through a ref to read the latest tab without churning the
    // listener registration on every setTab (which would leave a brief
    // window with duplicate listeners and made the listener race with
    // PerformerProfileContext's own hashchange handler).
    const tabRef = useRef<Tab>(tab);
    useEffect(() => {
        tabRef.current = tab;
    }, [tab]);
    useEffect(() => {
        const onHashChange = () => {
            const next = readTabFromHash();
            if (next && next !== tabRef.current) {
                setTabRaw(next);
                setTabBarVisible(true);
                setReelMode("random");
            }
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    const setTab = useCallback((next: Tab) => {
        setTabRaw(next);
        // Always re-show the bar on tab switch — otherwise switching from a
        // scrolled tab would land on the new tab with the bar still hidden.
        setTabBarVisible(true);
        // A manual tab switch (TabBar tap, hashtag jump, story-viewer
        // CTA, etc.) is an explicit takeover — drop any in-flight
        // chained mode so e.g. tapping the "Explore" tab while
        // watching a chained reel returns to the Explore grid rather
        // than re-rendering the same reel.
        setReelMode("random");
        writeTabToHash(next);
    }, []);

    const value = useMemo<TabContextValue>(
        () => ({
            tab,
            setTab,
            tabBarVisible,
            setTabBarVisible,
            pinFirstSceneId,
            setPinFirstSceneId,
            pinnedQueue,
            setPinnedQueue,
            reelMode,
            setReelMode,
        }),
        [
            tab,
            setTab,
            tabBarVisible,
            pinFirstSceneId,
            pinnedQueue,
            reelMode,
        ]
    );

    return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}

export function useTab(): TabContextValue {
    const ctx = useContext(TabContext);
    if (!ctx) throw new Error("useTab must be used within TabProvider");
    return ctx;
}
