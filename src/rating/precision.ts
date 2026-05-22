// Fetch Stash's configured rating precision so binge's preview
// formula snaps to the same increments ASR/APR's hook will use
// server-side. Same mapping the plugins themselves apply:
//
//   ratingSystemOptions.type
//     STARS:
//       starPrecision = FULL    → 20  (whole stars only)
//       starPrecision = HALF    → 10
//       starPrecision = QUARTER → 5
//       starPrecision = TENTH   → 1
//     DECIMAL: 1 (any value 0–100)
//
// Cached for the session — the user's choice doesn't change often.

const STASH_GRAPHQL = "/graphql";

interface ConfigResp {
    data?: {
        configuration?: {
            ui?: unknown;
        };
    };
}

let cached: Promise<number> | null = null;

export function loadRatingPrecision(): Promise<number> {
    if (cached) return cached;
    cached = (async () => {
        try {
            const resp = await fetch(STASH_GRAPHQL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: `query { configuration { ui } }`,
                }),
            });
            if (!resp.ok) return 20;
            const body = (await resp.json()) as ConfigResp;
            return precisionFromUiConfig(body.data?.configuration?.ui);
        } catch {
            return 20;
        }
    })();
    return cached;
}

function precisionFromUiConfig(ui: unknown): number {
    if (!ui || typeof ui !== "object") return 20;
    const opts = (ui as { ratingSystemOptions?: unknown }).ratingSystemOptions;
    if (!opts || typeof opts !== "object") return 20;
    const o = opts as { type?: string; starPrecision?: string };
    if (o.type === "DECIMAL") return 1;
    switch (o.starPrecision) {
        case "FULL":
            return 20;
        case "HALF":
            return 10;
        case "QUARTER":
            return 5;
        case "TENTH":
            return 1;
        default:
            return 20;
    }
}

export function invalidateRatingPrecision(): void {
    cached = null;
}
