import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

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
}

const EMPTY_FILTER: FilterState = { performers: [], tags: [], studios: [] };

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
    const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);

    const add = useCallback((category: FilterCategory, entry: FilterEntry) => {
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

    const clear = useCallback(() => setFilter(EMPTY_FILTER), []);

    const replace = useCallback((next: FilterState) => setFilter(next), []);

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
                filter.studios.length === 0,
        }),
        [filter, add, remove, clear, replace]
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
