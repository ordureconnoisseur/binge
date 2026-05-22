import { scoreTagName, type Criterion } from "./types";
import type { TagMin } from "./ratings";

// Stash GraphQL endpoint (same origin as the binge plugin host).
const STASH_GRAPHQL = "/graphql";

interface GqlResponse<T> {
    data?: T;
    errors?: { message: string }[];
}

async function gql<T>(
    query: string,
    variables: Record<string, unknown> = {}
): Promise<T> {
    const resp = await fetch(STASH_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) {
        throw new Error(`Stash GraphQL HTTP ${resp.status}`);
    }
    const body = (await resp.json()) as GqlResponse<T>;
    if (body.errors && body.errors.length > 0) {
        throw new Error(body.errors.map((e) => e.message).join("; "));
    }
    if (!body.data) throw new Error("Empty response data");
    return body.data;
}

// Find a score tag by name. binge intentionally does NOT auto-create
// these — they belong under ASR/APR's own parent-tag tree, and the
// plugins' settings panel is responsible for materialising them so
// the hierarchy stays clean. Returns null when the tag doesn't
// exist; the modal surfaces a "please initialize via ASR/APR's
// settings panel" message in that case.
//
// Cached for the session so repeat lookups don't hit Stash.
const tagIdCache = new Map<string, string>();

export async function findScoreTag(
    criterion: Criterion,
    score: number
): Promise<string | null> {
    const name = scoreTagName(criterion, score);
    const cached = tagIdCache.get(name);
    if (cached) return cached;

    const findResp = await gql<{
        findTags: { tags: { id: string; name: string }[] };
    }>(
        `query($name: String!) {
            findTags(
                tag_filter: { name: { value: $name, modifier: EQUALS } },
                filter: { per_page: 1 }
            ) {
                tags { id name }
            }
        }`,
        { name }
    );
    const existing = findResp.findTags.tags.find((t) => t.name === name);
    if (existing) {
        tagIdCache.set(name, existing.id);
        return existing.id;
    }
    return null;
}

// Apply a new tag_ids array to a scene. Returns the updated tags
// so the caller can re-render. The plugin's Scene.Update.Post Python
// hook will recompute scene.rating100 automatically after this.
export async function applySceneTagIds(
    sceneId: string,
    tagIds: ReadonlyArray<string>
): Promise<TagMin[]> {
    const resp = await gql<{
        sceneUpdate: { id: string; tags: { id: string; name: string }[] };
    }>(
        `mutation($input: SceneUpdateInput!) {
            sceneUpdate(input: $input) {
                id
                tags { id name }
            }
        }`,
        { input: { id: sceneId, tag_ids: tagIds } }
    );
    return resp.sceneUpdate.tags;
}

export async function applyPerformerTagIds(
    performerId: string,
    tagIds: ReadonlyArray<string>
): Promise<TagMin[]> {
    const resp = await gql<{
        performerUpdate: { id: string; tags: { id: string; name: string }[] };
    }>(
        `mutation($input: PerformerUpdateInput!) {
            performerUpdate(input: $input) {
                id
                tags { id name }
            }
        }`,
        { input: { id: performerId, tag_ids: tagIds } }
    );
    return resp.performerUpdate.tags;
}

// Fetch latest tags + rating100 for a scene/performer. Used after
// each update to pick up the rating100 the plugin hook computed.
export async function fetchSceneTagsAndRating(
    sceneId: string
): Promise<{ tags: TagMin[]; rating100: number | null }> {
    const resp = await gql<{
        findScene: {
            id: string;
            rating100: number | null;
            tags: TagMin[];
        } | null;
    }>(
        `query($id: ID!) {
            findScene(id: $id) {
                id
                rating100
                tags { id name }
            }
        }`,
        { id: sceneId }
    );
    return {
        tags: resp.findScene?.tags ?? [],
        rating100: resp.findScene?.rating100 ?? null,
    };
}

export async function fetchPerformerTagsAndRating(
    performerId: string
): Promise<{ tags: TagMin[]; rating100: number | null }> {
    const resp = await gql<{
        findPerformer: {
            id: string;
            rating100: number | null;
            tags: TagMin[];
        } | null;
    }>(
        `query($id: ID!) {
            findPerformer(id: $id) {
                id
                rating100
                tags { id name }
            }
        }`,
        { id: performerId }
    );
    return {
        tags: resp.findPerformer?.tags ?? [],
        rating100: resp.findPerformer?.rating100 ?? null,
    };
}
