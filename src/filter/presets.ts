import type { FilterState } from "./FilterContext";

export interface FilterPreset {
    id: string;
    name: string;
    filter: FilterState;
    savedAt: number;
}

const STORAGE_KEY = "binge.filterPresets";

export function loadPresets(): FilterPreset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Light validation — drop anything that doesn't look like a preset
        return parsed.filter(
            (p): p is FilterPreset =>
                p &&
                typeof p.id === "string" &&
                typeof p.name === "string" &&
                p.filter &&
                Array.isArray(p.filter.performers) &&
                Array.isArray(p.filter.tags) &&
                Array.isArray(p.filter.studios)
        );
    } catch {
        return [];
    }
}

export function savePresets(presets: FilterPreset[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch {
        // Quota or private mode — silently fail; the UI will surface stale state on next load.
    }
}

export function newPresetId(): string {
    // Cheap random id — collision risk is negligible with the small N we expect (<100).
    return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
