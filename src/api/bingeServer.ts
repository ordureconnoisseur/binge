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
    // X (Twitter) auth_token + ct0 pair — true once both are stored.
    xCookiesSet?: boolean;
}

export interface BingeServerConfigPayload {
    stashUrl?: string;
    stashApiKey?: string;
    redditSessionCookie?: string;
    // X cookies must be sent together (auth_token is useless without ct0).
    xAuthToken?: string;
    xCt0?: string;
}

// One media file from a performer's X media tab. Mirrors
// internal/twitter/client.go's Media. Discriminated by `kind`.
export interface XMedia {
    tweetId: string;
    tweetUrl: string;
    kind: "image" | "video";
    mediaUrl: string;
    text?: string;
    authorHandle?: string;
    authorNick?: string;
    width?: number;
    height?: number;
    sensitive: boolean;
    favoriteCount?: number;
    viewCount?: number;
    createdUtc: number;
}

export interface XFeedResponse {
    handle: string;
    count: number;
    media: XMedia[];
}

// Whether it's safe to transmit credentials (Stash API key / Reddit
// cookie) to this binge-server URL. https is always fine; plain http is
// allowed only to loopback / private / tailnet hosts (a self-hosted
// daemon reached over an encrypted tailnet or trusted LAN) — never to a
// public host, which would put the secrets on the open internet in
// cleartext. Also stops an attacker who can rewrite the daemon-URL
// setting (another same-origin plugin, an XSS) from redirecting creds.
export function isTrustedDaemonUrl(raw: string): boolean {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol === "https:") return true;
    if (u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1")
        return true;
    if (
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".ts.net")
    )
        return true;
    // Bare hostname (no dot) is a LAN/tailnet machine name, not public.
    if (!host.includes(".")) return true;
    // RFC1918 private + Tailscale CGNAT (100.64/10) IPv4 literals.
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / tailnet
        return false;
    }
    // Dotted public hostname → untrusted for cleartext credentials.
    return false;
}

// xHandleFromUrls mirrors binge-server's HandleFromURLs — pulls the
// first twitter.com / x.com handle out of a performer's urls[], skipping
// reserved path segments. Used client-side only to decide whether to
// show the X tab (the actual fetch resolves the handle server-side).
const X_RESERVED = new Set([
    "home", "search", "explore", "notifications", "messages", "i",
    "intent", "share", "hashtag", "settings", "compose",
]);
export function xHandleFromUrls(urls: string[] | null | undefined): string | null {
    if (!urls) return null;
    for (const u of urls) {
        const m = u.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
        if (m && !X_RESERVED.has(m[1].toLowerCase())) return m[1];
    }
    return null;
}

async function fetchJSON<T>(
    path: string,
    init?: RequestInit,
    timeoutMs = 8000
): Promise<T | null> {
    const base = readBingeServerUrl();
    try {
        const resp = await fetch(base + path, {
            ...init,
            // Tailscale Funnel + Mullvad NL adds latency vs a local
            // daemon. 8s is enough for the fast (DB-backed) endpoints;
            // callers that shell out server-side (X → gallery-dl) pass a
            // larger budget.
            signal: AbortSignal.timeout(timeoutMs),
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

// getXFeed pulls a performer's X media tab on demand. Returns null on a
// daemon/fetch failure (same graceful-degrade contract as the reddit
// calls); a reachable daemon with no handle / no media returns an empty
// media array. `limit` caps how deep gallery-dl scrolls.
export async function getXFeed(
    stashId: number,
    limit = 40
): Promise<XFeedResponse | null> {
    // A cold fetch shells out to gallery-dl + round-trips X through the
    // Mullvad funnel — well over the default 8s budget from a slow
    // network. Give it 25s (server-side cap is ~50s; cached hits are
    // instant).
    return fetchJSON<XFeedResponse>(
        `/x/feed/${stashId}?limit=${limit}`,
        undefined,
        25_000
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
    // Never send the Stash API key / Reddit cookie over cleartext to a
    // remote host. https or a local/tailnet daemon only.
    if (!isTrustedDaemonUrl(base)) {
        return {
            ok: false,
            error: "Won't send credentials to an untrusted binge-server URL — use https:// or a local/tailnet address.",
        };
    }
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
// returned by binge-server. The daemon queries Stash with whatever
// STASH_URL it was configured with, so paths can come back fully
// qualified to a different origin than the browser knows (e.g. the
// daemon ran with `STASH_URL=http://10.0.0.42:9999` but the browser
// loaded binge from `http://localhost:9999`). That cross-origin
// mismatch means the Stash session cookie doesn't apply and Stash
// 302s the browser to its login page. Rewriting to a path-relative
// URL lets the browser hit Stash on its own origin with cookies
// attached.
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
