import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { gql } from "../api/graphql";

// Tracks which Stash plugins are installed AND enabled. The binge
// ActionStack uses this to conditionally render plugin-gated buttons
// (Multiview / Scribe), and the favourites + rating flows assume
// nothing about ASR/APR being present — but the same lookup is useful
// for nearby decisions (e.g. UX copy hints).
//
// Stash's root GraphQL field `plugins { id name enabled }` returns all
// installed plugins with their enabled flag. We treat "disabled" as
// equivalent to "not installed" — a disabled plugin's UI affordances
// in binge should disappear too.

interface PluginEntry {
    id: string;
    enabled: boolean;
}

interface PluginContextValue {
    loaded: boolean;
    hasPlugin: (id: string) => boolean;
}

const PluginContext = createContext<PluginContextValue | null>(null);

// Known plugin IDs from the user's suite (binge integrates with these
// specifically). Exported so call sites read the same constants the
// detection logic does.
export const PLUGIN_ID_ASR = "advancedSceneRating";
export const PLUGIN_ID_APR = "advancedPerformerRating";
export const PLUGIN_ID_MULTIVIEW = "multiView";
export const PLUGIN_ID_SCRIBE = "stashScribe";

const QUERY_PLUGINS = /* GraphQL */ `
    query InstalledPlugins {
        plugins {
            id
            enabled
        }
    }
`;

export function PluginProvider({ children }: { children: ReactNode }) {
    const [entries, setEntries] = useState<PluginEntry[] | null>(null);

    useEffect(() => {
        let alive = true;
        gql<{ plugins: PluginEntry[] }>(QUERY_PLUGINS)
            .then((data) => {
                if (!alive) return;
                setEntries(data.plugins);
            })
            .catch(() => {
                // If the query fails (older Stash version, network blip),
                // treat as "no plugins detected". Plugin-gated buttons
                // will stay hidden — safer than showing a button that
                // wouldn't work.
                if (alive) setEntries([]);
            });
        return () => {
            alive = false;
        };
    }, []);

    const value = useMemo<PluginContextValue>(() => {
        const enabledIds = new Set(
            (entries ?? []).filter((p) => p.enabled).map((p) => p.id)
        );
        return {
            loaded: entries !== null,
            hasPlugin: (id: string) => enabledIds.has(id),
        };
    }, [entries]);

    return (
        <PluginContext.Provider value={value}>
            {children}
        </PluginContext.Provider>
    );
}

function usePluginContext(): PluginContextValue {
    const ctx = useContext(PluginContext);
    if (!ctx) throw new Error("usePlugin must be used within PluginProvider");
    return ctx;
}

// Generic — for one-off uses. The named helpers below are the common path.
export function useHasPlugin(id: string): boolean {
    return usePluginContext().hasPlugin(id);
}

export function useHasASR(): boolean {
    return usePluginContext().hasPlugin(PLUGIN_ID_ASR);
}
export function useHasAPR(): boolean {
    return usePluginContext().hasPlugin(PLUGIN_ID_APR);
}
export function useHasMultiview(): boolean {
    return usePluginContext().hasPlugin(PLUGIN_ID_MULTIVIEW);
}
export function useHasScribe(): boolean {
    return usePluginContext().hasPlugin(PLUGIN_ID_SCRIBE);
}
