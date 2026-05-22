// Tiny GraphQL client. Same-origin to /graphql — Stash auth cookies
// authenticate automatically. No Apollo until we actually need its caching.

type GqlResponse<T> = { data?: T; errors?: { message: string }[] };

// Ring buffer of recent request durations + an op-name extracted from
// the query text. The DebugOverlay reads via getGqlStats() and renders
// rolling stats for performance diagnosis. Cheap — just numbers + a
// few short strings, never grows past RING_SIZE.
const RING_SIZE = 20;
interface GqlSample {
    name: string;
    ms: number;
    failed: boolean;
    timestamp: number;
}
const ring: GqlSample[] = [];
let totalRequests = 0;
let inFlight = 0;
let totalFailures = 0;

function pushSample(sample: GqlSample): void {
    if (ring.length >= RING_SIZE) ring.shift();
    ring.push(sample);
}

// Crude operation-name extraction. Matches `query Foo` / `mutation Foo`;
// falls back to "anonymous" if neither is found. Only used for the
// debug overlay — accuracy is fine.
function extractOpName(query: string): string {
    const m = query.match(/\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    return m ? m[1] : "anonymous";
}

export interface GqlStats {
    samples: ReadonlyArray<GqlSample>;
    inFlight: number;
    totalRequests: number;
    totalFailures: number;
    avgMs: number;
    maxMs: number;
}

export function getGqlStats(): GqlStats {
    if (ring.length === 0) {
        return {
            samples: [],
            inFlight,
            totalRequests,
            totalFailures,
            avgMs: 0,
            maxMs: 0,
        };
    }
    let sum = 0;
    let max = 0;
    for (const s of ring) {
        sum += s.ms;
        if (s.ms > max) max = s.ms;
    }
    return {
        samples: ring,
        inFlight,
        totalRequests,
        totalFailures,
        avgMs: sum / ring.length,
        maxMs: max,
    };
}

export async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    const name = extractOpName(query);
    const start = performance.now();
    inFlight += 1;
    totalRequests += 1;
    try {
        const res = await fetch("/graphql", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) {
            throw new Error(
                `GraphQL HTTP ${res.status} ${res.statusText}`
            );
        }
        const body = (await res.json()) as GqlResponse<T>;
        if (body.errors?.length) {
            throw new Error(body.errors.map((e) => e.message).join("; "));
        }
        if (!body.data) {
            throw new Error("GraphQL response missing data");
        }
        pushSample({
            name,
            ms: performance.now() - start,
            failed: false,
            timestamp: Date.now(),
        });
        return body.data;
    } catch (err) {
        totalFailures += 1;
        pushSample({
            name,
            ms: performance.now() - start,
            failed: true,
            timestamp: Date.now(),
        });
        throw err;
    } finally {
        inFlight -= 1;
    }
}
