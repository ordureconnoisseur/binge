// Stash Multiview plugin client.
//
// The queue is SHARED across four clients: this (binge web), the Stash
// Multiview plugin UI + its player, binge-iOS, and multiview-ios. The
// single source of truth is Stash's plugin config
// (configuration.plugins.multiView.queue, a JSON string). localStorage
// is only a fast local cache so the buttons can render synchronously; it
// is always reconciled FROM config, and every write is a read-modify-
// write of config so a concurrent change from another client is never
// clobbered.
//
// Queue shape: JSON array. Each element is either a scene id (string) or
// a filter slot ({ type: "filter", filter: {...} }). binge only ever
// toggles scene-id strings; filter slots are preserved on write-back.

export const MULTIVIEW_STORAGE_KEY = "stash-multiview-queue";
export const MULTIVIEW_MAX_QUEUE = 16;
export const MULTIVIEW_PLAYER_URL = "/plugin/multiView/assets/index.html";

// Fired on the window after any local-cache change (optimistic flip,
// config reconcile, or poll) so same-tab subscribers refresh. The native
// `storage` event only fires in OTHER tabs, so we need this for the tab
// that made the change + for async reconciliation.
const CHANGE_EVENT = "binge-multiview-queue-changed";

type MultiviewFilterItem = { type: "filter"; filter: Record<string, unknown> };
export type MultiviewQueueItem = string | MultiviewFilterItem;

function readCache(): MultiviewQueueItem[] {
    try {
        const raw = localStorage.getItem(MULTIVIEW_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeCache(queue: MultiviewQueueItem[]): void {
    try {
        localStorage.setItem(MULTIVIEW_STORAGE_KEY, JSON.stringify(queue));
    } catch (err) {
        console.warn("[binge] multiview cache write failed", err);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isInMultiviewQueue(sceneId: string): boolean {
    return readCache().includes(sceneId);
}

export function multiviewQueueCount(): number {
    return readCache().length;
}

// ── Config (source of truth) ────────────────────────────────────────

async function fetchConfigQueue(): Promise<MultiviewQueueItem[]> {
    const r = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ configuration { plugins } }" }),
    });
    const j = await r.json();
    const raw = j?.data?.configuration?.plugins?.multiView?.queue;
    try {
        const a = JSON.parse(raw || "[]");
        return Array.isArray(a) ? a : [];
    } catch {
        return [];
    }
}

async function writeConfigQueue(queue: MultiviewQueueItem[]): Promise<void> {
    await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: 'mutation($input: Map!) { configurePlugin(plugin_id: "multiView", input: $input) }',
            variables: { input: { queue: JSON.stringify(queue) } },
        }),
    });
}

// In-flight config writes — the poll backs off while > 0 so it can't
// reconcile the cache from a not-yet-committed config and revert an
// optimistic change.
let pendingWrites = 0;

// Apply a set-membership intent (ensure sceneId present when `want`,
// absent otherwise) to the LIVE config queue, with a read-back verify
// and bounded retry. configurePlugin is last-write-wins with no
// compare-and-swap, so a concurrent writer can clobber us between write
// and read-back; we detect that (intent didn't stick) and re-apply
// against the now-current queue. Idempotent set intents converge.
async function applyIntent(sceneId: string, want: boolean): Promise<void> {
    pendingWrites++;
    try {
        for (let attempt = 0; attempt < 4; attempt++) {
            let items: MultiviewQueueItem[];
            try {
                items = await fetchConfigQueue();
            } catch {
                return;
            }
            const present = items.includes(sceneId);
            if (want === present) {
                writeCache(items);
                return;
            }
            if (want) {
                if (items.length >= MULTIVIEW_MAX_QUEUE) {
                    writeCache(items);
                    return;
                }
                items.push(sceneId);
            } else {
                const k = items.indexOf(sceneId);
                if (k >= 0) items.splice(k, 1);
            }
            try {
                await writeConfigQueue(items);
            } catch {
                return;
            }
            let after: MultiviewQueueItem[];
            try {
                after = await fetchConfigQueue();
            } catch {
                writeCache(items);
                return;
            }
            if (after.includes(sceneId) === want) {
                writeCache(after);
                return;
            }
            // Clobbered — loop and re-apply against the current queue.
        }
        try {
            writeCache(await fetchConfigQueue());
        } catch {
            /* keep cache */
        }
    } finally {
        pendingWrites--;
    }
}

// Reconcile the local cache from the authoritative config.
let syncing = false;
export async function syncMultiviewFromConfig(): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
        const q = await fetchConfigQueue();
        if (JSON.stringify(q) !== localStorage.getItem(MULTIVIEW_STORAGE_KEY)) {
            writeCache(q);
        }
    } catch {
        /* offline / transient — keep the cache */
    } finally {
        syncing = false;
    }
}

// Toggle scene-id presence. The cache flips optimistically (so the
// button responds instantly and the sync return value is correct), then
// the change is applied to config in the background with verify+retry.
// Returns the new optimistic state; if adding would exceed the cap based
// on the local cache, returns false without modifying.
export function toggleMultiviewQueueScene(sceneId: string): boolean {
    const want = !isInMultiviewQueue(sceneId);
    const queue = readCache();
    if (want) {
        if (queue.length >= MULTIVIEW_MAX_QUEUE) return false;
        queue.push(sceneId);
    } else {
        const idx = queue.indexOf(sceneId);
        if (idx >= 0) queue.splice(idx, 1);
    }
    writeCache(queue);
    void applyIntent(sceneId, want);
    return want;
}

// Subscribe to queue changes (same-tab change event + cross-tab storage
// event). Returns an unsubscribe fn.
export function subscribeMultiviewQueue(cb: () => void): () => void {
    const onChange = () => cb();
    const onStorage = (e: StorageEvent) => {
        if (e.key === MULTIVIEW_STORAGE_KEY) cb();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

// Start the config-sync loop (idempotent): seed the cache now, then poll
// while the tab is visible + on becoming visible, so the buttons track
// the live queue as other clients change it.
let syncStarted = false;
export function startMultiviewSync(): void {
    if (syncStarted) return;
    syncStarted = true;
    void syncMultiviewFromConfig();
    setInterval(() => {
        if (document.visibilityState === "visible" && pendingWrites === 0) {
            void syncMultiviewFromConfig();
        }
    }, 5000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && pendingWrites === 0) {
            void syncMultiviewFromConfig();
        }
    });
}

export function openMultiviewPlayer(): void {
    window.open(MULTIVIEW_PLAYER_URL, "_blank", "noopener,noreferrer");
}
