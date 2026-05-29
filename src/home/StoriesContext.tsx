import { createContext, useContext, type ReactNode } from "react";
import { useStories, type StoriesResult } from "./useStories";

// Shared stories state. The internal hook (`useStories`) drives
// its own fetch + state via useEffect, so calling it from many
// places means many parallel fetches and many independent loading
// states. SceneFeedCard mounts under TanStack Virtual's recycler,
// so cards remount on scroll and start fresh "loading" cycles —
// breaks the per-card story ring (no ring → click → no ring
// again on scroll-back-up).
//
// One Provider at the app root calls `useStories()` ONCE; every
// downstream consumer reads the same state. Refresh actions go
// through the same shared instance too.

const StoriesContext = createContext<StoriesResult | null>(null);

export function StoriesProvider({ children }: { children: ReactNode }) {
    const value = useStories();
    return (
        <StoriesContext.Provider value={value}>
            {children}
        </StoriesContext.Provider>
    );
}

/// Read the shared stories state. Throws if no Provider above —
/// surfaces wiring mistakes loud and early instead of silently
/// spawning a per-component fetch.
export function useSharedStories(): StoriesResult {
    const ctx = useContext(StoriesContext);
    if (!ctx) {
        throw new Error(
            "useSharedStories must be used within StoriesProvider"
        );
    }
    return ctx;
}
