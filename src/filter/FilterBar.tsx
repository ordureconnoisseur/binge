import { useState } from "react";
import { useFilter, type FilterCategory, type FilterEntry } from "./FilterContext";
import { AddChipMenu } from "./AddChipMenu";
import { PresetsMenu } from "./PresetsMenu";

// Top chip bar. Shows active filter entries as removable pills, plus an
// "+ filter" trailing chip that opens the searchable AddChipMenu. When no
// filters are active, the entire bar collapses to the "+ filter" pill so
// it doesn't eat vertical screen real estate.
export function FilterBar() {
    const { filter, remove, clear, isEmpty } = useFilter();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [presetsOpen, setPresetsOpen] = useState(false);

    // The two popovers are mutually exclusive — opening one closes the other.
    const togglePicker = () => {
        setPresetsOpen(false);
        setPickerOpen((v) => !v);
    };
    const togglePresets = () => {
        setPickerOpen(false);
        setPresetsOpen((v) => !v);
    };

    const sections: { category: FilterCategory; entries: FilterEntry[] }[] = [
        { category: "performers", entries: filter.performers },
        { category: "tags", entries: filter.tags },
        { category: "studios", entries: filter.studios },
    ];

    return (
        <div className={"binge-filter-bar" + (isEmpty ? " is-empty" : "")}>
            <div className="binge-filter-chips">
                {sections.map(({ category, entries }) =>
                    entries.map((e) => (
                        <button
                            key={`${category}:${e.id}`}
                            type="button"
                            className={`binge-filter-chip binge-filter-chip-${category}`}
                            onClick={() => remove(category, e.id)}
                            title={`Remove ${e.name}`}
                            aria-label={`Remove ${e.name} from filter`}
                        >
                            {category === "performers" && (
                                <span
                                    className="binge-filter-chip-avatar"
                                    style={
                                        e.image_path
                                            ? {
                                                  backgroundImage: `url(${e.image_path})`,
                                              }
                                            : undefined
                                    }
                                >
                                    {!e.image_path && (
                                        <span>{e.name.charAt(0).toUpperCase()}</span>
                                    )}
                                </span>
                            )}
                            <span className="binge-filter-chip-label">
                                {e.name}
                            </span>
                            <span className="binge-filter-chip-x" aria-hidden="true">
                                ×
                            </span>
                        </button>
                    ))
                )}

                <button
                    type="button"
                    className="binge-filter-add"
                    onClick={togglePicker}
                    title="Add filter"
                    aria-expanded={pickerOpen}
                >
                    <span aria-hidden="true">+</span>
                    <span className="binge-filter-add-label">filter</span>
                </button>

                <button
                    type="button"
                    className="binge-filter-add binge-filter-presets"
                    onClick={togglePresets}
                    title="Saved filter presets"
                    aria-expanded={presetsOpen}
                >
                    <span className="binge-filter-add-label">presets</span>
                </button>

                {!isEmpty && (
                    <button
                        type="button"
                        className="binge-filter-clear"
                        onClick={clear}
                        title="Clear all filters"
                    >
                        clear
                    </button>
                )}
            </div>

            {pickerOpen && <AddChipMenu onClose={() => setPickerOpen(false)} />}
            {presetsOpen && (
                <PresetsMenu onClose={() => setPresetsOpen(false)} />
            )}
        </div>
    );
}
