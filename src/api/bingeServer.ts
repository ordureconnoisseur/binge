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
    // New in v0.2 — present when the daemon reports its config state.
    // false → Stash creds or Reddit cookie not yet set.
    configured?: boolean;
    lastPerformerSync: string;
    lastPoll: string;
    performerCount: number;
    postCount: number;
}

export interface BingeServerConfigState {
    // The stash URL the daemon will use (visible — not a secret).
    stashUrl: string;
    // Whether each secret has been persisted. Booleans only — the
    // daemon never returns the secret values themselves.
    stashApiKeySet: boolean;
    redditCookieSet: boolean;
}

export interface BingeServerConfigPayload {
    stashUrl?: string;
    stashApiKey?: string;
    redditSessionCookie?: string;
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

export async function getBingeServerConfig(): Promise<BingeServerConfigState | null> {
    return fetchJSON<BingeServerConfigState>("/config");
}

// setBingeServerConfig POSTs the given subset of credentials to the
// daemon. The daemon validates each non-empty field against the live
// service (Reddit /api/me.json + Stash GraphQL) before persisting.
// On validation failure the daemon returns 400 with {error:"…"}; we
// surface that to the caller so the UI can render an inline message.
export async function setBingeServerConfig(
    payload: BingeServerConfigPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
    const base = readBingeServerUrl();
    try {
        const resp = await fetch(base + "/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15_000),
        });
        const body = (await resp.json().catch(() => ({}))) as {
            error?: string;
        };
        if (!resp.ok) {
            return { ok: false, error: body.error || resp.statusText };
        }
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
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

// Rewrite Reddit-hosted image/video URLs (i.redd.it / preview.redd.it /
// external-preview.redd.it / v.redd.it) through binge-server's
// /reddit/proxy. Same hotlink/referrer/firewall reasons as redgifs —
// gallery preview URLs in particular get 403'd by Reddit's CDN when
// requested from a non-reddit origin. Returns input unchanged for
// non-Reddit hosts.
export function rewriteRedditMediaUrl(url: string | null): string | null {
    if (!url) return url;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return url;
    }
    const host = parsed.host.toLowerCase();
    if (!(host.endsWith(".redd.it") || host.endsWith(".redditmedia.com"))) {
        return url;
    }
    const base = readBingeServerUrl();
    return `${base}/reddit/proxy?url=${encodeURIComponent(url)}`;
}
