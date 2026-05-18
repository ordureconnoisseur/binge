import { useEffect, useRef, useState } from "react";
import {
    findPerformersForPicker,
    findStudiosForPicker,
    findTagsForPicker,
    type PickerResult,
} from "../api/queries";
import { useFilter, type FilterCategory } from "./FilterContext";

interface AddChipMenuProps {
    onClose: () => void;
}

const TABS: { id: FilterCategory; label: string }[] = [
    { id: "performers", label: "Performers" },
    { id: "tags", label: "Tags" },
    { id: "studios", label: "Studios" },
];

// Search-and-add picker. One tab per filter category. Type to search; each
// hit is clickable. Debounces input so we don't fire 6 queries per keystroke.
export function AddChipMenu({ onClose }: AddChipMenuProps) {
    const [tab, setTab] = useState<FilterCategory>("performers");
    const [q, setQ] = useState("");
    const [results, setResults] = useState<PickerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const { add, filter } = useFilter();
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Autofocus the search field on open
    useEffect(() => {
        inputRef.current?.focus();
    }, [tab]);

    // Debounced search — 180ms after last keystroke
    useEffect(() => {
        const trimmed = q.trim();
        // Empty query still loads top results — gives users a starting list
        // instead of an empty panel.
        let alive = true;
        setLoading(true);
        const handle = window.setTimeout(() => {
            const fetcher =
                tab === "performers"
                    ? findPerformersForPicker
                    : tab === "tags"
                      ? findTagsForPicker
                      : findStudiosForPicker;
            fetcher(trimmed)
                .then((res) => {
                    if (!alive) return;
                    setResults(res);
                })
                .catch(() => {
                    if (!alive) return;
                    setResults([]);
                })
                .finally(() => {
                    if (alive) setLoading(false);
                });
        }, 180);
        return () => {
            alive = false;
            window.clearTimeout(handle);
        };
    }, [q, tab]);

    // Click-outside dismiss
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!panelRef.current?.contains(e.target as Node)) {
                onClose();
            }
        };
        // Defer so the same click that opened us doesn't immediately dismiss
        const t = window.setTimeout(
            () => document.addEventListener("mousedown", handler),
            0
        );
        return () => {
            window.clearTimeout(t);
            document.removeEventListener("mousedown", handler);
        };
    }, [onClose]);

    // Esc to dismiss
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const alreadySelected = new Set(filter[tab].map((e) => e.id));

    const handlePick = (item: PickerResult) => {
        add(tab, { id: item.id, name: item.name, image_path: item.image_path });
        // Keep the panel open so users can add multiple in a row; clear query
        // for the next pick.
        setQ("");
        inputRef.current?.focus();
    };

    return (
        <div className="binge-chip-menu" ref={panelRef} role="dialog">
            <div className="binge-chip-menu-tabs" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        className={
                            "binge-chip-menu-tab" +
                            (tab === t.id ? " is-active" : "")
                        }
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <input
                ref={inputRef}
                type="text"
                className="binge-chip-menu-input"
                placeholder={`Search ${tab}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
            />
            <ul className="binge-chip-menu-results">
                {loading && (
                    <li className="binge-chip-menu-status">searching…</li>
                )}
                {!loading && results.length === 0 && (
                    <li className="binge-chip-menu-status">no results</li>
                )}
                {results.map((r) => {
                    const isSelected = alreadySelected.has(r.id);
                    return (
                        <li key={r.id}>
                            <button
                                type="button"
                                className={
                                    "binge-chip-menu-row" +
                                    (isSelected ? " is-selected" : "")
                                }
                                onClick={() => handlePick(r)}
                                disabled={isSelected}
                            >
                                {tab === "performers" && (
                                    <span
                                        className="binge-chip-menu-avatar"
                                        style={
                                            r.image_path
                                                ? {
                                                      backgroundImage: `url(${r.image_path})`,
                                                  }
                                                : undefined
                                        }
                                    >
                                        {!r.image_path && (
                                            <span>
                                                {r.name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </span>
                                )}
                                <span className="binge-chip-menu-name">
                                    {r.name}
                                </span>
                                {isSelected && (
                                    <span className="binge-chip-menu-tick">
                                        ✓
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
