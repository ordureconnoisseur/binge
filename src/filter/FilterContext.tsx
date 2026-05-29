import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import {
    type StashSavedFilter,
} from "../api/queries";

export interface FilterEntry {
    id: string;
    name: string;
    image_path?: string | null;
}

export interface FilterState {
    performers: FilterEntry[];
    tags: FilterEntry[];
    studios: FilterEntry[];
}

export type FilterCategory = "performers" | "tags" | "studios";

interface FilterContextValue {
    filter: FilterState;
    add: (category: FilterCategory, entry: FilterEntry) => void;
    remove: (category: FilterCategory, id: string) => void;
    clear: () => void;
    replace: (next: FilterState) => void;
    isEmpty: boolean;
    // Stash native saved-filter mode. When non-null, the Reel
    // bypasses buildSceneFilter and passes the saved filter's
    // object_filter + find_filter straight to findScenes. Chip state
    // is mutually exclusive: applying a saved filter clears chips;
    // adding a chip clears the saved filter.
    activeSavedFilter: StashSavedFilter | null;
    applySavedFilter: (sf: StashSavedFilter) => void;
    clearSavedFilter: () => void;
}

const EMPTY_FILTER: FilterState = { performers: [], tags: [], studios: [] };

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
    const [activeSavedFilter, setActiveSavedFilter] =
        useState<StashSavedFilter | null>(null);

    const add = useCallback((category: FilterCategory, entry: FilterEntry) => {
        // Adding a chip is a deliberate override — drop any active
        // saved filter so the two modes never mix.
        setActiveSavedFilter(null);
        setFilter((current) => {
            // Dedup by id — tapping the same performer twice doesn't grow the chip row.
            const existing = current[category];
            if (existing.some((e) => e.id === entry.id)) return current;
            return { ...current, [category]: [...existing, entry] };
        });
    }, []);

    const remove = useCallback((category: FilterCategory, id: string) => {
        setFilter((current) => ({
            ...current,
            [category]: current[category].filter((e) => e.id !== id),
        }));
    }, []);

    const clear = useCallback(() => {
        setFilter(EMPTY_FILTER);
        setActiveSavedFilter(null);
    }, []);

    const replace = useCallback((next: FilterState) => {
        setActiveSavedFilter(null);
        setFilter(next);
    }, []);

    const applySavedFilter = useCallback((sf: StashSavedFilter) => {
        // Saved-filter mode is mutually exclusive with chips.
        setFilter(EMPTY_FILTER);
        setActiveSavedFilter(sf);
    }, []);

    const clearSavedFilter = useCallback(() => {
        setActiveSavedFilter(null);
    }, []);

    const value = useMemo<FilterContextValue>(
        () => ({
            filter,
            add,
            remove,
            clear,
            replace,
            isEmpty:
                filter.performers.length === 0 &&
                filter.tags.length === 0 &&
                filter.studios.length === 0 &&
                activeSavedFilter === null,
            activeSavedFilter,
            applySavedFilter,
            clearSavedFilter,
        }),
        [
            filter,
            add,
            remove,
            clear,
            replace,
            activeSavedFilter,
            applySavedFilter,
            clearSavedFilter,
        ]
    );

    return (
        <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
    );
}

export function useFilter(): FilterContextValue {
    const ctx = useContext(FilterContext);
    if (!ctx) throw new Error("useFilter must be used within FilterProvider");
    return ctx;
}
