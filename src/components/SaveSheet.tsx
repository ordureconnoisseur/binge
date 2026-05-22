import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    createCollection,
    getCollections,
    subscribeCollections,
    type CollectionDef,
    type CollectionIconName,
} from "../api/collections";

interface SaveSheetProps {
    inCollections: Record<string, boolean>;
    onToggle: (tagName: string) => void;
    onClose: () => void;
}

// IG-style "Save to..." bottom sheet. Lists default + user-created
// collections with checkmarks; "+ New collection" at the bottom
// reveals an inline name input to create a new one.
//
// Portalled to <body> for the same stacking-context reason as
// PerformerSheet / SceneDetailsSheet — the slide's `.binge-overlay`
// would otherwise clip our z-index beneath the action stack.
export function SaveSheet({
    inCollections,
    onToggle,
    onClose,
}: SaveSheetProps) {
    const [collections, setCollections] = useState<CollectionDef[]>([]);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [submitBusy, setSubmitBusy] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Initial + on-change reload of the collections list. The
    // subscription fires after a successful createCollection().
    useEffect(() => {
        let alive = true;
        const refresh = () => {
            getCollections()
                .then((cs) => {
                    if (alive) setCollections(cs);
                })
                .catch(() => {
                    /* leave previous list if reload fails */
                });
        };
        refresh();
        const off = subscribeCollections(refresh);
        return () => {
            alive = false;
            off();
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setSubmitBusy(true);
        setSubmitError(null);
        try {
            await createCollection(trimmed);
            setNewName("");
            setCreating(false);
        } catch (err) {
            setSubmitError(
                err instanceof Error ? err.message : String(err)
            );
        } finally {
            setSubmitBusy(false);
        }
    };

    return createPortal(
        <div className="binge-sheet-root">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet binge-save-sheet"
                role="dialog"
                aria-label="Save scene to a collection"
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <div className="binge-save-sheet-header">
                    <h2 className="binge-save-sheet-title">Save to…</h2>
                </div>

                <ul className="binge-save-sheet-list" role="list">
                    {collections.map((c) => {
                        const active = inCollections[c.tagName] ?? false;
                        return (
                            <li key={c.tagName}>
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={active}
                                    className={
                                        "binge-save-sheet-row" +
                                        (active ? " is-active" : "")
                                    }
                                    onClick={() => onToggle(c.tagName)}
                                >
                                    <span className="binge-save-sheet-icon">
                                        <CollectionIcon
                                            name={c.icon}
                                            filled={active}
                                        />
                                    </span>
                                    <span className="binge-save-sheet-name">
                                        {c.name}
                                    </span>
                                    <span
                                        className={
                                            "binge-save-sheet-check" +
                                            (active ? " is-checked" : "")
                                        }
                                        aria-hidden="true"
                                    >
                                        {active ? "✓" : ""}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {/* New-collection footer. Switches between a "+ New
                    collection" button and an inline input. */}
                <div className="binge-save-sheet-footer">
                    {creating ? (
                        <form
                            className="binge-save-sheet-create-form"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleCreate();
                            }}
                        >
                            <input
                                type="text"
                                className="binge-save-sheet-input"
                                placeholder="Collection name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoFocus
                                maxLength={60}
                                disabled={submitBusy}
                            />
                            <button
                                type="submit"
                                className="binge-save-sheet-create-confirm"
                                disabled={submitBusy || !newName.trim()}
                            >
                                Create
                            </button>
                            <button
                                type="button"
                                className="binge-save-sheet-create-cancel"
                                onClick={() => {
                                    setCreating(false);
                                    setNewName("");
                                    setSubmitError(null);
                                }}
                                disabled={submitBusy}
                            >
                                Cancel
                            </button>
                        </form>
                    ) : (
                        <button
                            type="button"
                            className="binge-save-sheet-create-btn"
                            onClick={() => setCreating(true)}
                        >
                            + New collection
                        </button>
                    )}
                    {submitError && (
                        <div className="binge-save-sheet-error">
                            {submitError}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function CollectionIcon({
    name,
    filled,
}: {
    name: CollectionIconName;
    filled: boolean;
}) {
    if (name === "favourite") {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1.4em"
                height="1.4em"
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={filled ? 1 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
        );
    }
    if (name === "watchLater") {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="1.4em"
                height="1.4em"
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={filled ? 1 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
        );
    }
    // generic folder
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="1.4em"
            height="1.4em"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={filled ? 1 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
    );
}
