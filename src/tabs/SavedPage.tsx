import { useEffect, useRef, useState } from "react";
import {
    createCollection,
    deleteCollection,
    getCollections,
    subscribeCollections,
    type CollectionDef,
} from "../api/collections";
import {
    findRecentScenesForTag,
    findScenesByTag,
    type CollectionCover,
} from "../api/queries";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "./TabContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";
import { SceneCardGrid } from "../components/SceneCardGrid";

// IG-style "Saved" page. Grid of collection tiles with cover
// thumbnails (latest scene tagged with the collection). Per-tile
// long-press → delete confirmation. "+" in the header opens an
// inline create-input. Tap a tile → drops into the For You reel
// filtered to that tag.
//
// Mounted via the hidden `saved` tab — Home's header has a small
// bookmark button that calls setTab("saved"). The Saved tab is NOT
// shown in the TabBar; Home is the only entry point.
//
// 700ms hold → delete confirmation (matches the multiview-button
// long-press threshold).
const LONG_PRESS_MS = 700;

interface CollectionWithCover {
    def: CollectionDef;
    cover: CollectionCover | null; // null while loading
}

export function SavedPage() {
    const { setTab, setPinFirstSceneId } = useTab();
    const { replace } = useFilter();
    const scrollRef = useRef<HTMLDivElement>(null);
    useAutoHideTabBar(scrollRef);

    const [items, setItems] = useState<CollectionWithCover[]>([]);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [submitBusy, setSubmitBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // tag-name of the row currently showing the delete confirm sheet
    const [confirmDelete, setConfirmDelete] =
        useState<CollectionDef | null>(null);
    // When set, the page shows the collection's scene grid instead of
    // the tile overview. Cleared by the in-detail Back button.
    const [openCollection, setOpenCollection] =
        useState<CollectionDef | null>(null);

    // Load collections + each cover. Subscribes so create/delete
    // mutations trigger a re-render with the fresh list.
    useEffect(() => {
        let alive = true;
        const reload = async () => {
            try {
                const collections = await getCollections();
                if (!alive) return;
                // Show structure immediately; covers populate as their
                // queries resolve.
                setItems(collections.map((def) => ({ def, cover: null })));
                const covers = await Promise.all(
                    collections.map((c) =>
                        // Use the cached tag-id map indirectly via the
                        // collection module's own lookup so we don't
                        // refetch tag ids per call.
                        resolveCover(c.tagName)
                    )
                );
                if (!alive) return;
                setItems(
                    collections.map((def, i) => ({
                        def,
                        cover: covers[i],
                    }))
                );
            } catch (e) {
                if (alive)
                    setError(e instanceof Error ? e.message : String(e));
            }
        };
        void reload();
        const off = subscribeCollections(() => void reload());
        return () => {
            alive = false;
            off();
        };
    }, []);

    const handleOpenCollection = (c: CollectionDef) => {
        // Tile tap → enter the collection's grid view (NOT the reel).
        // The reel entry is now driven from inside that view, when the
        // user taps an individual scene tile.
        setOpenCollection(c);
    };

    // Picked from inside the collection detail. Replaces the filter
    // with this collection's tag + pins the picked scene, then drops
    // into the reel.
    const handlePickSceneInCollection = (
        c: CollectionDef,
        sceneId: string
    ) => {
        replace({
            performers: [],
            tags: [{ id: tagIdFromCachedCovers(c.tagName), name: c.name }],
            studios: [],
        });
        setPinFirstSceneId(sceneId);
        setTab("foryou");
    };

    // Look up the tag id from the latest cover-query result. The
    // findLatestSceneForTag query already fetched it; we cache the
    // collection tag-id map separately via getCollectionTagIds, but
    // we don't need to round-trip — keep a local map populated as
    // covers resolve.
    const tagIdsRef = useRef<Map<string, string>>(new Map());
    function tagIdFromCachedCovers(tagName: string): string {
        return tagIdsRef.current.get(tagName) ?? "";
    }

    async function resolveCover(
        tagName: string
    ): Promise<CollectionCover | null> {
        // The collections module owns the tag-id map. Defer to it.
        const { getCollectionTagIds } = await import("../api/collections");
        const map = await getCollectionTagIds();
        const id = map.get(tagName);
        if (!id) return null;
        tagIdsRef.current.set(tagName, id);
        return await findRecentScenesForTag(id, 4);
    }

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setSubmitBusy(true);
        setError(null);
        try {
            await createCollection(trimmed);
            setNewName("");
            setCreating(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitBusy(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        try {
            await deleteCollection(confirmDelete.tagName);
            setConfirmDelete(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setConfirmDelete(null);
        }
    };

    // Detail view: scene grid for a single collection. Renders inside
    // the same Saved pane (not a new tab) so back-stack behaves
    // naturally.
    if (openCollection) {
        const tagId = tagIdFromCachedCovers(openCollection.tagName);
        return (
            <div className="binge-tab-scroll" ref={scrollRef}>
                <header className="binge-saved-header">
                    <button
                        type="button"
                        className="binge-saved-back"
                        onClick={() => setOpenCollection(null)}
                        aria-label="Back to Saved"
                        title="Back"
                    >
                        <ChevronLeft />
                    </button>
                    <h1 className="binge-saved-title">
                        {openCollection.name}
                    </h1>
                    <span className="binge-saved-spacer" />
                </header>
                {tagId ? (
                    <SceneCardGrid
                        resetKey={openCollection.tagName}
                        fetcher={(page, perPage) =>
                            findScenesByTag(tagId, page, perPage)
                        }
                        onPick={(scene) =>
                            handlePickSceneInCollection(
                                openCollection,
                                scene.id
                            )
                        }
                        emptyMessage="No scenes saved to this collection yet."
                    />
                ) : (
                    <div className="binge-status">resolving collection…</div>
                )}
            </div>
        );
    }

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <header className="binge-saved-header">
                <button
                    type="button"
                    className="binge-saved-back"
                    onClick={() => setTab("home")}
                    aria-label="Back to Home"
                    title="Back"
                >
                    <ChevronLeft />
                </button>
                <h1 className="binge-saved-title">Saved</h1>
                <button
                    type="button"
                    className="binge-saved-add"
                    onClick={() => setCreating((v) => !v)}
                    aria-label="New collection"
                    title="New collection"
                >
                    <PlusIcon />
                </button>
            </header>

            {creating && (
                <form
                    className="binge-saved-create-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleCreate();
                    }}
                >
                    <input
                        type="text"
                        className="binge-saved-create-input"
                        placeholder="Collection name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        autoFocus
                        maxLength={60}
                        disabled={submitBusy}
                    />
                    <button
                        type="submit"
                        className="binge-saved-create-confirm"
                        disabled={submitBusy || !newName.trim()}
                    >
                        Create
                    </button>
                    <button
                        type="button"
                        className="binge-saved-create-cancel"
                        onClick={() => {
                            setCreating(false);
                            setNewName("");
                            setError(null);
                        }}
                        disabled={submitBusy}
                    >
                        Cancel
                    </button>
                </form>
            )}

            {error && <div className="binge-saved-error">{error}</div>}

            <div className="binge-saved-grid">
                {items.map((it) => (
                    <CollectionTile
                        key={it.def.tagName}
                        def={it.def}
                        cover={it.cover}
                        onOpen={() => handleOpenCollection(it.def)}
                        onLongPress={() => setConfirmDelete(it.def)}
                    />
                ))}
            </div>

            {confirmDelete && (
                <DeleteConfirm
                    name={confirmDelete.name}
                    isProtected={confirmDelete.tagName.includes("★")}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
}

function CollectionTile({
    def,
    cover,
    onOpen,
    onLongPress,
}: {
    def: CollectionDef;
    cover: CollectionCover | null;
    onOpen: () => void;
    onLongPress: () => void;
}) {
    const holdRef = useRef<number | null>(null);
    const heldRef = useRef(false);

    const onPointerDown = () => {
        heldRef.current = false;
        holdRef.current = window.setTimeout(() => {
            heldRef.current = true;
            holdRef.current = null;
            onLongPress();
        }, LONG_PRESS_MS);
    };
    const onPointerUp = () => {
        if (holdRef.current !== null) {
            window.clearTimeout(holdRef.current);
            holdRef.current = null;
        }
        if (!heldRef.current) onOpen();
    };
    const onPointerLeave = () => {
        if (holdRef.current !== null) {
            window.clearTimeout(holdRef.current);
            holdRef.current = null;
        }
    };

    const scenes = cover?.scenes ?? [];
    return (
        <button
            type="button"
            className="binge-saved-tile"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerLeave}
            aria-label={`Open ${def.name}`}
            title="Tap to open · hold to delete"
        >
            <div
                className={
                    "binge-saved-tile-cover" +
                    (scenes.length === 0
                        ? " is-empty"
                        : scenes.length === 1
                          ? " is-single"
                          : " is-mosaic")
                }
            >
                {scenes.length === 0 ? (
                    <span className="binge-saved-tile-empty">empty</span>
                ) : scenes.length === 1 ? (
                    <div
                        className="binge-saved-tile-single"
                        style={
                            scenes[0].screenshot
                                ? {
                                      backgroundImage: `url(${scenes[0].screenshot})`,
                                  }
                                : undefined
                        }
                    />
                ) : (
                    // 2×2 mosaic; fewer than 4 scenes leaves remaining
                    // cells as dark placeholders.
                    [0, 1, 2, 3].map((i) => {
                        const s = scenes[i];
                        return (
                            <div
                                key={i}
                                className="binge-saved-tile-cell"
                                style={
                                    s?.screenshot
                                        ? {
                                              backgroundImage: `url(${s.screenshot})`,
                                          }
                                        : undefined
                                }
                            />
                        );
                    })
                )}
            </div>
            <div className="binge-saved-tile-meta">
                <span className="binge-saved-tile-name">{def.name}</span>
                {cover && (
                    <span className="binge-saved-tile-count">
                        {cover.count}
                    </span>
                )}
            </div>
        </button>
    );
}

function DeleteConfirm({
    name,
    isProtected,
    onConfirm,
    onCancel,
}: {
    name: string;
    isProtected: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onCancel]);

    return (
        <div className="binge-saved-confirm-root">
            <div
                className="binge-saved-confirm-backdrop"
                onClick={onCancel}
            />
            <div className="binge-saved-confirm-card" role="dialog">
                <h3 className="binge-saved-confirm-title">
                    Delete "{name}"?
                </h3>
                <p className="binge-saved-confirm-body">
                    {isProtected
                        ? "This collection is shared with ASR and can't be deleted from binge. Use Stash's tag manager if you really want to remove it."
                        : "The collection's Stash tag will be deleted. Scenes inside it stay in your library; only the tag association goes away."}
                </p>
                <div className="binge-saved-confirm-actions">
                    <button
                        type="button"
                        className="binge-saved-confirm-cancel"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="binge-saved-confirm-destroy"
                        onClick={onConfirm}
                        disabled={isProtected}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 18l-6-6 6-6" />
        </svg>
    );
}
function PlusIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}
