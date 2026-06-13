import {
    readForageToken,
    readForageUrl,
    readForageWatchTarget,
    type ForageWatchTarget,
} from "../home/pluginSettings";
import { isTrustedDaemonUrl } from "./bingeServer";

// Client for the forage daemon (github.com/ordureconnoisseur/forager).
// binge only uses ONE forage endpoint: POST /watches, which adds a
// StashDB scene to forage's watchlist so the daemon tracks it and
// notifies the user (with a one-click grab) when a release at the
// target quality appears. forage never auto-grabs from a watch — the
// safe "send this to my downloader's radar" action.
//
// Auth: forage gates every route except / and /healthz behind an admin
// token when one is configured. We send it as a Bearer header (no
// cookie needed — that's only for forage's own <img> proxy). Cross-
// origin works as long as the user sets forage's allowed-origin to
// binge's origin (or "*") in forage Settings → Security.

export function isForageConfigured(): boolean {
    return readForageUrl().trim() !== "";
}

function authHeaders(): Record<string, string> {
    const token = readForageToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// True when binge was loaded over HTTPS but the forage URL is plain
// HTTP — the browser blocks every such fetch silently, so we surface a
// useful message instead of an opaque "NetworkError".
function mixedContentBlocked(base: string): boolean {
    return (
        typeof location !== "undefined" &&
        location.protocol === "https:" &&
        base.startsWith("http:")
    );
}

// Subset of forage's /healthz payload we care about for the Settings
// status dot. The endpoint is public (no token required).
export interface ForageHealth {
    ok: boolean;
    version?: string;
    unconfigured?: boolean;
    prowlarrConfigured?: boolean;
    adminAuthRequired?: boolean;
}

// Returns null on any failure (unreachable, mixed-content block, CORS,
// timeout). Never throws — the Settings dot just shows "unreachable".
export async function getForageHealth(): Promise<ForageHealth | null> {
    const base = readForageUrl();
    if (!base) return null;
    if (mixedContentBlocked(base)) return null;
    try {
        const resp = await fetch(base + "/healthz", {
            signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return null;
        return (await resp.json()) as ForageHealth;
    } catch (err) {
        console.warn("[forage] healthz fetch failed:", err);
        return null;
    }
}

export interface ForageWatchRequest {
    stashdb_id: string;
    title: string;
    date?: string;
    studio?: string;
    image_url?: string;
    performer_name?: string;
    // Local Stash performer id, when the scene's headline performer is
    // already in the library. Omitted for unfollowed performers.
    performer_id?: string;
    // Defaults to the user's configured watch quality when omitted.
    target?: ForageWatchTarget;
}

export type ForageWatchResult =
    | { ok: true; target: string }
    | { ok: false; error: string };

// addForageWatch POSTs a discovery scene to forage's watchlist. Mirrors
// the forage plugin's own addWatch payload 1:1. Never throws — returns a
// tagged result the card renders inline.
export async function addForageWatch(
    req: ForageWatchRequest
): Promise<ForageWatchResult> {
    const base = readForageUrl();
    if (!base) {
        return {
            ok: false,
            error: "Add your forage server URL in Settings first.",
        };
    }
    if (mixedContentBlocked(base)) {
        return {
            ok: false,
            error: "forage URL is http:// but binge is loaded over https — the browser blocks this. Use an https:// (or tailnet) forage URL.",
        };
    }
    // The admin token is a secret. Don't transmit it in cleartext to a
    // public host (an attacker who can rewrite the URL setting could
    // otherwise harvest it). https or a local/tailnet daemon only.
    if (readForageToken() && !isTrustedDaemonUrl(base)) {
        return {
            ok: false,
            error: "Won't send the forage token to an untrusted URL — use https:// or a local/tailnet address.",
        };
    }

    const target: ForageWatchTarget = req.target ?? readForageWatchTarget();
    try {
        const resp = await fetch(base + "/watches", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ ...req, target }),
            signal: AbortSignal.timeout(15_000),
        });
        const body = (await resp.json().catch(() => ({}))) as {
            error?: string;
            target?: string;
        };
        if (!resp.ok) {
            if (resp.status === 401) {
                return {
                    ok: false,
                    error: "forage rejected the request (401) — check the API token in Settings.",
                };
            }
            return {
                ok: false,
                error: body.error || resp.statusText || `HTTP ${resp.status}`,
            };
        }
        return { ok: true, target: body.target || target };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
