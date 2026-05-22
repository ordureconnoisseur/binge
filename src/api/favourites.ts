import { findTagByName } from "./queries";
import { tagCreate, sceneUpdate } from "./mutations";

// ASR's convention: a scene is "favourited" if it carries a tag named
// exactly "Favourite ★" (space + star, capitalised "F"). When ASR is
// installed its UI lights up based on that tag's presence; when ASR
// isn't installed the tag is still a perfectly valid Stash tag.
//
// We auto-create the tag on first use with ignore_auto_tag:true (matches
// ASR's behaviour) so favouriting works whether or not the user has
// ever touched ASR.

const FAVOURITE_TAG_NAME = "Favourite ★";

// One-shot lookup-or-create per session. Returns the tag id.
// Promise is cached so concurrent calls (e.g. multiple SceneSlides
// initialising at once) only fire one network round-trip.
let cachedFavTagPromise: Promise<string> | null = null;

export function getFavouriteTagId(): Promise<string> {
    if (cachedFavTagPromise) return cachedFavTagPromise;
    cachedFavTagPromise = (async () => {
        const existing = await findTagByName(FAVOURITE_TAG_NAME);
        if (existing) return existing.id;
        const created = await tagCreate(FAVOURITE_TAG_NAME, true);
        return created.id;
    })().catch((err) => {
        // Don't poison the cache on failure — next call should retry.
        cachedFavTagPromise = null;
        throw err;
    });
    return cachedFavTagPromise;
}

// Toggle the favourite tag on a scene. Caller passes the scene's
// current tag ids so we don't need an extra read; we just diff and
// apply. Returns the new favourited boolean (true if it's now
// favourited, false if it's now unfavourited).
export async function setSceneFavourited(
    sceneId: string,
    currentTagIds: string[],
    next: boolean
): Promise<boolean> {
    const favTagId = await getFavouriteTagId();
    const has = currentTagIds.includes(favTagId);
    if (has === next) return next; // already in desired state
    const newTagIds = next
        ? [...currentTagIds, favTagId]
        : currentTagIds.filter((id) => id !== favTagId);
    await sceneUpdate({ id: sceneId, tag_ids: newTagIds });
    return next;
}
