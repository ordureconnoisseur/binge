// StashDB integration — surfaces "new releases" for performers in
// the local library that have a linked StashDB stash_id but aren't
// yet imported. Cribbed from `ordureconnoisseur/stash-new-scene-discovery`.
//
// Flow:
//   1. Pull StashDB endpoint + api_key from Stash's config
//      (configuration.general.stashBoxes).
//   2. List local performers that have a stash_id pointing at
//      stashdb.org/graphql.
//   3. List stash_ids of scenes ALREADY in the library, so we can
//      filter them out of the "new" results.
//   4. Batched POST to stashdb.org/graphql with
//      `queryScenes(input: { date: { value, modifier: GREATER_THAN },
//                            performers: { value: [batch], modifier: INCLUDES } })`.
//   5. Return scenes the user doesn't already own, grouped by performer.
//
// Caching: 12h TTL in localStorage. StashDB doesn't add new content
// minute-by-minute, and the StashDB GraphQL endpoint is rate-sensitive.

import { gql } from "./graphql";

const STASHDB_ENDPOINT = "https://stashdb.org/graphql";

export interface StashBoxConfig {
    endpoint: string;
    api_key: string;
}

export interface LinkedPerformer {
    localId: string;
    stashId: string;
    name: string;
    favorite: boolean;
    imagePath: string | null;
}

export interface StashDBScene {
    id: string;
    title: string | null;
    releaseDate: string | null;
    coverUrl: string | null;
    performerStashIds: string[];
}

// ── Local Stash config + linked-performer queries ────────────────────

const FIND_STASHBOX_CONFIG = /* GraphQL */ `
    query Configuration {
        configuration {
            general {
                stashBoxes {
                    endpoint
                    api_key
                    name
                }
            }
        }
    }
`;

export async function getStashDBBox(): Promise<StashBoxConfig | null> {
    const data = await gql<{
        configuration: {
            general: {
                stashBoxes: { endpoint: string; api_key: string }[];
            };
        };
    }>(FIND_STASHBOX_CONFIG);
    const box = data.configuration.general.stashBoxes.find(
        (b) => b.endpoint === STASHDB_ENDPOINT
    );
    return box && box.api_key ? box : null;
}

const FIND_LINKED_PERFORMERS = /* GraphQL */ `
    query LinkedPerformers {
        findPerformers(filter: { per_page: -1 }) {
            performers {
                id
                name
                favorite
                image_path
                stash_ids {
                    endpoint
                    stash_id
                }
            }
        }
    }
`;

export async function getLinkedPerformers(): Promise<LinkedPerformer[]> {
    const data = await gql<{
        findPerformers: {
            performers: {
                id: string;
                name: string;
                favorite: boolean;
                image_path: string | null;
                stash_ids: { endpoint: string; stash_id: string }[];
            }[];
        };
    }>(FIND_LINKED_PERFORMERS);
    const out: LinkedPerformer[] = [];
    for (const p of data.findPerformers.performers) {
        const link = p.stash_ids.find(
            (s) => s.endpoint === STASHDB_ENDPOINT
        );
        if (!link) continue;
        out.push({
            localId: p.id,
            stashId: link.stash_id,
            name: p.name,
            favorite: p.favorite,
            imagePath: p.image_path,
        });
    }
    return out;
}

const FIND_OWNED_STASH_IDS = /* GraphQL */ `
    query OwnedStashIds {
        findScenes(filter: { per_page: -1 }) {
            scenes {
                stash_ids {
                    endpoint
                    stash_id
                }
            }
        }
    }
`;

export async function getOwnedStashDBSceneIds(): Promise<Set<string>> {
    const data = await gql<{
        findScenes: {
            scenes: {
                stash_ids: { endpoint: string; stash_id: string }[];
            }[];
        };
    }>(FIND_OWNED_STASH_IDS);
    const owned = new Set<string>();
    for (const s of data.findScenes.scenes) {
        for (const sid of s.stash_ids) {
            if (sid.endpoint === STASHDB_ENDPOINT) owned.add(sid.stash_id);
        }
    }
    return owned;
}

// ── StashDB query ────────────────────────────────────────────────────

const PERFORMER_BATCH_SIZE = 100;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

async function postStashDB<T>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown>
): Promise<T | null> {
    try {
        const res = await fetch(STASHDB_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ApiKey: apiKey,
            },
            body: JSON.stringify({ query, variables }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
            data?: T;
            errors?: { message: string }[];
        };
        if (body.errors?.length) return null;
        return body.data ?? null;
    } catch {
        return null;
    }
}

const QUERY_SCENES = /* GraphQL */ `
    query QueryScenes($input: SceneQueryInput!) {
        queryScenes(input: $input) {
            count
            scenes {
                id
                title
                release_date
                images {
                    url
                }
                performers {
                    performer {
                        id
                    }
                }
            }
        }
    }
`;

// Fetch new StashDB scenes for the given performer batch, dated after
// `sinceIsoDate` (YYYY-MM-DD). Paginated. Returns flat list.
async function fetchStashDBScenesBatch(
    apiKey: string,
    performerStashIds: string[],
    sinceIsoDate: string
): Promise<StashDBScene[]> {
    const out: StashDBScene[] = [];
    let page = 1;
    while (page <= MAX_PAGES) {
        const data = await postStashDB<{
            queryScenes: {
                count: number;
                scenes: {
                    id: string;
                    title: string | null;
                    release_date: string | null;
                    images: { url: string }[];
                    performers: { performer: { id: string } }[];
                }[];
            };
        }>(apiKey, QUERY_SCENES, {
            input: {
                date: { value: sinceIsoDate, modifier: "GREATER_THAN" },
                performers: {
                    value: performerStashIds,
                    modifier: "INCLUDES",
                },
                sort: "DATE",
                direction: "DESC",
                page,
                per_page: PAGE_SIZE,
            },
        });
        if (!data?.queryScenes?.scenes) break;
        for (const s of data.queryScenes.scenes) {
            out.push({
                id: s.id,
                title: s.title,
                releaseDate: s.release_date,
                coverUrl: s.images[0]?.url ?? null,
                performerStashIds: s.performers.map((x) => x.performer.id),
            });
        }
        if (data.queryScenes.scenes.length < PAGE_SIZE) break;
        page++;
    }
    return out;
}

export async function getNewStashDBScenesForPerformers(
    performerStashIds: string[],
    sinceIsoDate: string,
    apiKey: string
): Promise<StashDBScene[]> {
    if (performerStashIds.length === 0) return [];
    const merged: StashDBScene[] = [];
    for (let i = 0; i < performerStashIds.length; i += PERFORMER_BATCH_SIZE) {
        const batch = performerStashIds.slice(i, i + PERFORMER_BATCH_SIZE);
        const scenes = await fetchStashDBScenesBatch(
            apiKey,
            batch,
            sinceIsoDate
        );
        merged.push(...scenes);
    }
    // Dedupe by id (a scene with two of our performers shows up in two
    // batches).
    const seen = new Set<string>();
    return merged.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
    });
}

// ── 12h cache ───────────────────────────────────────────────────────

const CACHE_KEY = "binge.stashdb.newScenes.v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
    sinceIsoDate: string;
    fetchedAt: number;
    scenes: StashDBScene[];
}

export function readStashDBCache(
    sinceIsoDate: string
): StashDBScene[] | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw) as CacheEntry;
        if (entry.sinceIsoDate !== sinceIsoDate) return null;
        if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
        return entry.scenes;
    } catch {
        return null;
    }
}

export function writeStashDBCache(
    sinceIsoDate: string,
    scenes: StashDBScene[]
): void {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                sinceIsoDate,
                fetchedAt: Date.now(),
                scenes,
            } satisfies CacheEntry)
        );
    } catch {
        /* quota etc — ignore */
    }
}

export function invalidateStashDBCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch {
        /* ignore */
    }
}
