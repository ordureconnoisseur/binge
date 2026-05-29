import {
    findRecentScenes,
    findScenesByDate,
    findRecentGalleries,
    findGalleriesByDate,
    type RecentSceneRow,
    type RecentGalleryRow,
} from "../api/queries";

// Tiny in-memory cache so multiple Home widgets sharing the same data
// (stories row, feed) get one network fetch instead of N. 5-minute TTL
// is generous because binge tabs stay open for hours and the home
// screen has an explicit refresh button (plus storage events) for
// hard busting. Anything shorter and we burn dozens of repeat queries
// per session for data that changes once or twice a day.
const TTL_MS = 5 * 60_000;

// One slot per resource. The cache key includes `sinceIso` because
// callers compute their own "now - 30d" — without it, a slow caller
// would reuse a stale window after a midnight rollover.
interface Slot<T> {
    promise: Promise<T> | null;
    key: string | null;
    expiresAt: number;
}

function get<T>(slot: Slot<T>, key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (slot.key === key && slot.promise && now < slot.expiresAt) {
        return slot.promise;
    }
    slot.key = key;
    slot.promise = fetcher();
    slot.expiresAt = now + TTL_MS;
    return slot.promise;
}

const scenesByCreatedSlot: Slot<RecentSceneRow[]> = emptySlot();
const scenesByDateSlot: Slot<RecentSceneRow[]> = emptySlot();
const galleriesByCreatedSlot: Slot<RecentGalleryRow[]> = emptySlot();
const galleriesByDateSlot: Slot<RecentGalleryRow[]> = emptySlot();

function emptySlot<T>(): Slot<T> {
    return { promise: null, key: null, expiresAt: 0 };
}

export function getRecentScenes(
    sinceIso: string,
    showcase = false
): Promise<RecentSceneRow[]> {
    // Cache key includes showcase so flipping the Settings
    // toggle mid-session invalidates the cached filtered set.
    return get(scenesByCreatedSlot, `${sinceIso}|sc:${showcase}`, () =>
        findRecentScenes(sinceIso, 500, showcase)
    );
}
export function getScenesByDate(
    sinceDate: string,
    showcase = false
): Promise<RecentSceneRow[]> {
    return get(scenesByDateSlot, `${sinceDate}|sc:${showcase}`, () =>
        findScenesByDate(sinceDate, 500, showcase)
    );
}
export function getRecentGalleries(
    sinceIso: string
): Promise<RecentGalleryRow[]> {
    return get(galleriesByCreatedSlot, sinceIso, () =>
        findRecentGalleries(sinceIso)
    );
}
export function getGalleriesByDate(
    sinceDate: string
): Promise<RecentGalleryRow[]> {
    return get(galleriesByDateSlot, sinceDate, () =>
        findGalleriesByDate(sinceDate)
    );
}

// Drop the cache. Not used in v0 — exposed so future code can wire it
// without re-touching this file. Clears all four slots.
export function invalidateRecentScenes(): void {
    Object.assign(scenesByCreatedSlot, emptySlot());
    Object.assign(scenesByDateSlot, emptySlot());
}
export function invalidateRecentGalleries(): void {
    Object.assign(galleriesByCreatedSlot, emptySlot());
    Object.assign(galleriesByDateSlot, emptySlot());
}
