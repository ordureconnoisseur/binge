// Stash Multiview plugin client. The queue lives in localStorage and
// is the integration point for any other plugin (binge, the multiview
// player itself, etc.) — multiview's player listens to `storage` events
// for cross-tab sync, so writing here automatically propagates.
//
// Queue shape: JSON array. Each element is either:
//   - a scene id (string)
//   - a filter slot ({ type: "filter", filter: {...} })
// binge only ever pushes scene-id strings.

export const MULTIVIEW_STORAGE_KEY = "stash-multiview-queue";
export const MULTIVIEW_MAX_QUEUE = 16;
export const MULTIVIEW_PLAYER_URL = "/plugin/multiView/assets/index.html";

type MultiviewFilterItem = { type: "filter"; filter: Record<string, unknown> };
export type MultiviewQueueItem = string | MultiviewFilterItem;

function readQueue(): MultiviewQueueItem[] {
    try {
        const raw = localStorage.getItem(MULTIVIEW_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeQueue(queue: MultiviewQueueItem[]): void {
    try {
        localStorage.setItem(MULTIVIEW_STORAGE_KEY, JSON.stringify(queue));
    } catch {
        /* quota etc — ignore */
    }
}

export function isInMultiviewQueue(sceneId: string): boolean {
    return readQueue().includes(sceneId);
}

// Toggle scene-id presence in the multiview queue. Returns the new
// state (true = now queued, false = now unqueued). If adding would
// exceed MAX_QUEUE, returns false without modifying — caller can show
// a "queue full" toast if it wants.
export function toggleMultiviewQueueScene(sceneId: string): boolean {
    const queue = readQueue();
    const idx = queue.indexOf(sceneId);
    if (idx >= 0) {
        queue.splice(idx, 1);
        writeQueue(queue);
        return false;
    }
    if (queue.length >= MULTIVIEW_MAX_QUEUE) return false;
    queue.push(sceneId);
    writeQueue(queue);
    return true;
}

export function openMultiviewPlayer(): void {
    window.open(MULTIVIEW_PLAYER_URL, "_blank", "noopener,noreferrer");
}
