import {
    getRedditStories,
    getRedditFeed,
    type RedditStoryDigest,
    type RedditPost,
} from "../api/bingeServer";

// Mirror of recentScenesCache's slot pattern — short TTL so multiple
// Home widgets get one network fetch each (stories digest + per-
// performer feeds), without preventing fresh data from surfacing
// within a minute.
const TTL_MS = 30_000;

interface Slot<T> {
    promise: Promise<T> | null;
    key: string | null;
    expiresAt: number;
}

function emptySlot<T>(): Slot<T> {
    return { promise: null, key: null, expiresAt: 0 };
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

const storiesSlot: Slot<RedditStoryDigest[] | null> = emptySlot();
// Per-performer feed cache: one slot per stash_id. Lazy-created.
const feedSlots = new Map<number, Slot<RedditPost[] | null>>();

export function getCachedRedditStories(
    sinceUtc: number
): Promise<RedditStoryDigest[] | null> {
    return get(storiesSlot, String(sinceUtc), () => getRedditStories(sinceUtc));
}

export function getCachedRedditFeed(
    stashId: number,
    limit = 25
): Promise<RedditPost[] | null> {
    let slot = feedSlots.get(stashId);
    if (!slot) {
        slot = emptySlot();
        feedSlots.set(stashId, slot);
    }
    return get(slot, `${stashId}:${limit}`, () => getRedditFeed(stashId, limit));
}

export function invalidateRedditCaches(): void {
    Object.assign(storiesSlot, emptySlot());
    feedSlots.clear();
}
