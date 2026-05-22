import { readBingeServerUrl } from "../home/pluginSettings";

// Client for the binge-server Go daemon (handles Reddit polling +
// future social sources). Never throws — daemon-down should degrade
// gracefully so the existing stories row keeps rendering.
//
// Response shapes mirror internal/api/router.go 1:1.

export interface RedditStoryDigest {
    performerStashId: number;
    performerName: string;
    performerImagePath: string;
    performerFavorite: boolean;
    latestCreatedUtc: number;
    postCount: number;
    // Inline posts (up to 25 per performer) so Home renders the full
    // stories row in one round trip.
    posts: RedditPost[];
}

export interface RedditPost {
    id: string;                          // "t3_<base36>"
    kind: "image" | "video" | "text" | "link";
    title: string | null;
    body: string | null;
    mediaUrl: string | null;
    linkUrl: string | null;
    thumbUrl: string | null;
    permalink: string;
    domain: string | null;
    isNsfw: boolean;
    createdUtc: number;
}

export interface BingeServerHealth {
    ok: boolean;
    lastPerformerSync: string;
    lastPoll: string;
    performerCount: number;
    postCount: number;
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T | null> {
    const base = readBingeServerUrl();
    try {
        const resp = await fetch(base + path, {
            ...init,
            // Tailscale Funnel + Mullvad NL adds latency vs a local
            // daemon. 8s is enough for the slow path without making
            // Home mount feel sluggish when the daemon is off.
            signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) {
            // 4xx/5xx — log once but don't throw.
            console.warn(
                "[bingeServer] " + resp.status + " " + resp.statusText + " for " + path
            );
            return null;
        }
        return (await resp.json()) as T;
    } catch (err) {
        console.warn("[bingeServer] fetch failed for " + path + ":", err);
        return null;
    }
}

// Returns null on fetch failure (unreachable daemon, CORS, timeout, etc).
// Empty-but-successful response is an empty array. Callers should
// distinguish these — "daemon down" needs a different UI message than
// "daemon reachable but no posts".
export async function getRedditStories(
    sinceUtc: number
): Promise<RedditStoryDigest[] | null> {
    return fetchJSON<RedditStoryDigest[]>(
        `/reddit/stories?sinceUtc=${sinceUtc}`
    );
}

export async function getRedditFeed(
    stashId: number,
    limit = 25
): Promise<RedditPost[] | null> {
    return fetchJSON<RedditPost[]>(
        `/reddit/feed/${stashId}?limit=${limit}`
    );
}

export async function getBingeServerHealth(): Promise<BingeServerHealth | null> {
    return fetchJSON<BingeServerHealth>("/healthz");
}

// Strip the host from a Stash-rooted URL (image_path / preview / etc.)
// returned by binge-server. binge-server queried Stash via the PC's
// tailscale IP, so paths come back like
// `http://100.80.203.49:9999/performer/123/image?t=…` — that's a
// different origin from where binge is loaded (`http://localhost:9999`)
// so the Stash session cookie doesn't apply and Stash 302s the
// browser to login. Rewriting to a path-relative URL lets the
// browser hit Stash on its own origin with cookies attached.
const STASH_PATH_PREFIXES = ["/performer/", "/scene/", "/image/", "/files/"];
export function rewriteStashAssetUrl(url: string | null): string | null {
    if (!url) return url;
    try {
        const u = new URL(url);
        const path = u.pathname + u.search;
        if (STASH_PATH_PREFIXES.some((p) => u.pathname.startsWith(p))) {
            return path;
        }
        return url;
    } catch {
        return url;
    }
}

// Rewrite redgifs CDN URLs to go through binge-server's /redgifs/proxy
// endpoint. Reasons we proxy:
//   - redgifs 403s any request whose Referer isn't their own origin,
//     and we can't reliably override referrerpolicy on a <video>
//   - UK uni network may block adult-content CDNs at the firewall;
//     binge-server has a Mullvad NL exit so it can fetch upstream
// For non-redgifs URLs returns the input unchanged.
export function rewriteRedgifsMediaUrl(url: string | null): string | null {
    if (!url) return url;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return url;
    }
    if (!parsed.host.toLowerCase().endsWith(".redgifs.com")) {
        return url;
    }
    const base = readBingeServerUrl();
    return `${base}/redgifs/proxy?url=${encodeURIComponent(url)}`;
}
