import { useFilter, type FilterCategory, type FilterEntry } from "./FilterContext";

// Slim active-filters strip. Renders nothing when no chips are set; when
// there are chips, displays them inline (no add/presets/clear chrome) so
// they sit alongside the TabBar inside the shared top header gradient.
// Each chip is removable via its trailing × (or by clicking the chip body).
export function FilterBar() {
    const { filter, remove, isEmpty, activeSavedFilter, clearSavedFilter } =
        useFilter();

    // Showcase mode hides its own chip — it's auto-applied via
    // the Settings toggle, not the user clicking a saved filter,
    // so surfacing it as a removable chip would be confusing.
    if (activeSavedFilter?.name === "Showcase") {
        return null;
    }
    // Saved-filter mode: one chip showing the saved filter's name.
    // Tapping it clears the saved filter and returns to no-filter.
    if (activeSavedFilter) {
        return (
            <div className="binge-filter-bar">
                <div className="binge-filter-chips">
                    <button
                        type="button"
                        className="binge-filter-chip binge-filter-chip-saved"
                        onClick={() => clearSavedFilter()}
                        title={`Clear "${activeSavedFilter.name}" filter`}
                        aria-label={`Clear ${activeSavedFilter.name} filter`}
                    >
                        <span className="binge-filter-chip-label">
                            {activeSavedFilter.name}
                        </span>
                        <span
                            className="binge-filter-chip-x"
                            aria-hidden="true"
                        >
                            ×
                        </span>
                    </button>
                </div>
            </div>
        );
    }

    if (isEmpty) return null;

    const sections: { category: FilterCategory; entries: FilterEntry[] }[] = [
        { category: "performers", entries: filter.performers },
        { category: "tags", entries: filter.tags },
        { category: "studios", entries: filter.studios },
    ];

    return (
        <div className="binge-filter-bar">
            <div className="binge-filter-chips">
                {sections.flatMap(({ category, entries }) =>
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
            </div>
        </div>
    );
}
