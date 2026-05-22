import { findTagByName, findTagsContaining } from "./queries";
import { sceneUpdate, tagCreate, tagDestroy } from "./mutations";

// "Save to ..." folder system. Each collection is a Stash tag; the
// bookmark sheet lists all known collections + lets the user create new
// ones inline.
//
// ── Tag naming convention ────────────────────────────────────────────
// Collections use the trailing " 📁" suffix so they're distinguishable
// from other tags in Stash's tag manager and so we can discover them
// in a single substring query at app start. Mirrors the way ASR uses
// " ★" to mark its rating tags.
//
// Two exceptions:
//   1. The "Favourites" collection uses ASR's existing "Favourite ★"
//      tag — we want interop with ASR's UI, not a parallel tag.
//   2. The "Watch Later" default is created on first use with the new
//      suffix. (Was unsuffixed in the prior version of this code; that
//      tag is harmless to leave orphaned.)

const COLLECTION_TAG_SUFFIX = " 📁";
const FAVOURITES_TAG_NAME = "Favourite ★";
const DEFAULT_WATCH_LATER_TAG_NAME = `Watch Later${COLLECTION_TAG_SUFFIX}`;

export type CollectionIconName = "favourite" | "watchLater" | "generic";

export interface CollectionDef {
    name: string; // display label (no suffix, no star)
    tagName: string; // exact Stash tag name (with suffix or ★)
    icon: CollectionIconName;
    // Default collections render with their dedicated icon + can't be
    // removed by the user via binge. User-created collections render
    // with the generic folder icon.
    isDefault: boolean;
}

// Display name = tag name with the suffix stripped, for the menu.
function stripSuffix(tagName: string): string {
    if (tagName.endsWith(COLLECTION_TAG_SUFFIX)) {
        return tagName.slice(0, -COLLECTION_TAG_SUFFIX.length);
    }
    return tagName;
}

// ── In-memory cache ──────────────────────────────────────────────────
// Collections list + each tag's resolved Stash id. Cached because every
// SceneSlide that mounts wants both, and we'd rather make one round-trip
// per session than one per slide.

let cachedCollectionsPromise: Promise<CollectionDef[]> | null = null;
let cachedTagIdsPromise: Promise<Map<string, string>> | null = null;
type Subscriber = () => void;
const subscribers = new Set<Subscriber>();
function notifySubscribers(): void {
    for (const s of subscribers) s();
}

// React components subscribe so they re-render when a new collection
// is created mid-session.
export function subscribeCollections(fn: Subscriber): () => void {
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
    };
}

// Loads the collections list. Always starts with Favourites + Watch
// Later (default), then appends any user-created tags ending in the
// suffix. Default tags are find-or-created lazily on first toggle —
// we don't want loading the menu to mutate the user's tag list.
export function getCollections(): Promise<CollectionDef[]> {
    if (cachedCollectionsPromise) return cachedCollectionsPromise;
    cachedCollectionsPromise = (async () => {
        const userTags = await findTagsContaining(COLLECTION_TAG_SUFFIX);
        const defaults: CollectionDef[] = [
            {
                name: "Favourites",
                tagName: FAVOURITES_TAG_NAME,
                icon: "favourite",
                isDefault: true,
            },
            {
                name: "Watch Later",
                tagName: DEFAULT_WATCH_LATER_TAG_NAME,
                icon: "watchLater",
                isDefault: true,
            },
        ];
        // User-created collections (excluding Watch Later, which is a
        // default we already include).
        const userCollections: CollectionDef[] = userTags
            .filter((t) => t.name !== DEFAULT_WATCH_LATER_TAG_NAME)
            .map((t) => ({
                name: stripSuffix(t.name),
                tagName: t.name,
                icon: "generic",
                isDefault: false,
            }));
        return [...defaults, ...userCollections];
    })().catch((err) => {
        cachedCollectionsPromise = null;
        throw err;
    });
    return cachedCollectionsPromise;
}

// Resolve every collection's tag id. Lazy-creates any default tag that
// doesn't exist yet in Stash. Returns Map<tagName, tagId>.
export function getCollectionTagIds(): Promise<Map<string, string>> {
    if (cachedTagIdsPromise) return cachedTagIdsPromise;
    cachedTagIdsPromise = (async () => {
        const collections = await getCollections();
        const map = new Map<string, string>();
        for (const c of collections) {
            const existing = await findTagByName(c.tagName);
            if (existing) {
                map.set(c.tagName, existing.id);
                continue;
            }
            const created = await tagCreate(c.tagName, true);
            map.set(c.tagName, created.id);
        }
        return map;
    })().catch((err) => {
        cachedTagIdsPromise = null;
        throw err;
    });
    return cachedTagIdsPromise;
}

// Create a new user collection from a display name. The Stash tag is
// `<displayName> 📁`. After creation we wipe the caches so the next
// read picks up the new collection, then notify subscribers so any
// open SaveSheet re-renders.
export async function createCollection(
    displayName: string
): Promise<CollectionDef> {
    const trimmed = displayName.trim();
    if (!trimmed) throw new Error("Collection name cannot be empty");
    const tagName = `${trimmed}${COLLECTION_TAG_SUFFIX}`;
    // Avoid duplicate creation if the user races: find first.
    const existing = await findTagByName(tagName);
    if (!existing) {
        await tagCreate(tagName, true);
    }
    cachedCollectionsPromise = null;
    cachedTagIdsPromise = null;
    notifySubscribers();
    return {
        name: trimmed,
        tagName,
        icon: "generic",
        isDefault: false,
    };
}

// Delete a collection. The Stash tag is destroyed (which drops its
// scene associations); the scene files themselves are untouched.
// We refuse to delete the Favourites collection because it's ASR's
// tag and the user probably doesn't want to nuke their ASR favourites
// state. Returns true on success.
export async function deleteCollection(tagName: string): Promise<boolean> {
    if (tagName === FAVOURITES_TAG_NAME) {
        throw new Error(
            "The Favourites collection is shared with ASR and can't be deleted from binge."
        );
    }
    const tagIds = await getCollectionTagIds();
    const id = tagIds.get(tagName);
    if (!id) return false;
    await tagDestroy(id);
    cachedCollectionsPromise = null;
    cachedTagIdsPromise = null;
    notifySubscribers();
    return true;
}

// Toggle a scene's membership in a collection. Caller passes the scene's
// CURRENT tag ids; we diff and sceneUpdate. Returns the new state.
export async function setSceneInCollection(
    sceneId: string,
    currentTagIds: string[],
    tagName: string,
    next: boolean
): Promise<boolean> {
    const tagIds = await getCollectionTagIds();
    const id = tagIds.get(tagName);
    if (!id) return !next;
    const has = currentTagIds.includes(id);
    if (has === next) return next;
    const newTagIds = next
        ? [...currentTagIds, id]
        : currentTagIds.filter((t) => t !== id);
    await sceneUpdate({ id: sceneId, tag_ids: newTagIds });
    return next;
}
