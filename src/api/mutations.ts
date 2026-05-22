import { gql } from "./graphql";

const SCENE_INCREMENT_O = /* GraphQL */ `
    mutation SceneIncrementO($id: ID!) {
        sceneIncrementO(id: $id)
    }
`;

const SCENE_DECREMENT_O = /* GraphQL */ `
    mutation SceneDecrementO($id: ID!) {
        sceneDecrementO(id: $id)
    }
`;

interface IncrementOResult {
    sceneIncrementO: number;
}

interface DecrementOResult {
    sceneDecrementO: number;
}

export async function sceneIncrementO(sceneId: string): Promise<number> {
    const data = await gql<IncrementOResult>(SCENE_INCREMENT_O, {
        id: sceneId,
    });
    return data.sceneIncrementO;
}

export async function sceneDecrementO(sceneId: string): Promise<number> {
    const data = await gql<DecrementOResult>(SCENE_DECREMENT_O, {
        id: sceneId,
    });
    return data.sceneDecrementO;
}

// Generic scene update — used by both the rating mutation and the
// favourite-tag toggle. Both reuse the same Stash mutation shape.
const SCENE_UPDATE = /* GraphQL */ `
    mutation SceneUpdate($input: SceneUpdateInput!) {
        sceneUpdate(input: $input) {
            id
            rating100
            tags {
                id
                name
            }
        }
    }
`;

export interface SceneUpdateInput {
    id: string;
    rating100?: number | null;
    tag_ids?: string[];
}

export interface SceneUpdateResult {
    id: string;
    rating100: number | null;
    tags: { id: string; name: string }[];
}

export async function sceneUpdate(
    input: SceneUpdateInput
): Promise<SceneUpdateResult> {
    const data = await gql<{ sceneUpdate: SceneUpdateResult }>(SCENE_UPDATE, {
        input,
    });
    return data.sceneUpdate;
}

// Quick-rate from the reel. Stash's rating100 is 0–100; binge maps
// 0–5 stars to 0/20/40/60/80/100 at the call site.
export async function setSceneRating(
    sceneId: string,
    rating100: number | null
): Promise<number | null> {
    const result = await sceneUpdate({ id: sceneId, rating100 });
    return result.rating100;
}

// Used to find/create ASR's "Favourite ★" tag. ignore_auto_tag stops
// the tag from being auto-applied during scrapes — favourites are a
// user gesture, not metadata.
const TAG_CREATE = /* GraphQL */ `
    mutation TagCreate($input: TagCreateInput!) {
        tagCreate(input: $input) {
            id
            name
        }
    }
`;

export async function tagCreate(
    name: string,
    ignoreAutoTag: boolean
): Promise<{ id: string; name: string }> {
    const data = await gql<{ tagCreate: { id: string; name: string } }>(
        TAG_CREATE,
        { input: { name, ignore_auto_tag: ignoreAutoTag } }
    );
    return data.tagCreate;
}

const TAG_DESTROY = /* GraphQL */ `
    mutation TagDestroy($id: ID!) {
        tagDestroy(input: { id: $id })
    }
`;

// Delete a tag. Stash drops the tag's scene/performer/image
// associations along with it; the scene files themselves are not
// touched. Used by the SavedPage to remove a binge collection.
export async function tagDestroy(tagId: string): Promise<boolean> {
    const data = await gql<{ tagDestroy: boolean }>(TAG_DESTROY, {
        id: tagId,
    });
    return data.tagDestroy;
}

const PERFORMER_UPDATE_FAVORITE = /* GraphQL */ `
    mutation PerformerSetFavorite($id: ID!, $favorite: Boolean!) {
        performerUpdate(input: { id: $id, favorite: $favorite }) {
            id
            favorite
        }
    }
`;

interface PerformerUpdateResult {
    performerUpdate: { id: string; favorite: boolean };
}

export async function setPerformerFavorite(
    performerId: string,
    favorite: boolean
): Promise<boolean> {
    const data = await gql<PerformerUpdateResult>(PERFORMER_UPDATE_FAVORITE, {
        id: performerId,
        favorite,
    });
    return data.performerUpdate.favorite;
}
