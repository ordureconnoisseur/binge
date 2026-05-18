import { gql } from "./graphql";

// Minimal shape of a Stash scene used by the reel. Fields are the union of
// what we need for: <video> playback, the overlay (title, performers,
// tags), and chip-filter interactions (performer.id).
export interface BingeScene {
    id: string;
    title: string | null;
    details: string | null;
    rating100: number | null;
    o_counter: number | null;
    paths: {
        stream: string;
        screenshot: string;
        preview: string | null;
    };
    sceneStreams: { url: string; mime_type: string | null; label: string | null }[];
    files: { duration: number }[];
    performers: { id: string; name: string; image_path: string | null }[];
    studio: { id: string; name: string } | null;
    tags: { id: string; name: string }[];
    date: string | null;
}

export interface FindScenesResult {
    findScenes: {
        count: number;
        scenes: BingeScene[];
    };
}

export interface FindScenesVariables {
    filter?: {
        page?: number;
        per_page?: number;
        sort?: string;
        direction?: "ASC" | "DESC";
    };
    scene_filter?: {
        performers?: { value: string[]; modifier: "INCLUDES_ALL" | "INCLUDES" };
        tags?: { value: string[]; modifier: "INCLUDES_ALL" | "INCLUDES" };
        studios?: { value: string[]; modifier: "INCLUDES_ALL" | "INCLUDES" };
    };
}

// Translate a high-level filter state (chips) to Stash's SceneFilterType
// shape. We use INCLUDES (any match) for each category so adding multiple
// chips broadens within a category and the categories combine via AND.
export function buildSceneFilter(
    performerIds: string[],
    tagIds: string[],
    studioIds: string[]
): FindScenesVariables["scene_filter"] {
    const sf: FindScenesVariables["scene_filter"] = {};
    if (performerIds.length)
        sf.performers = { value: performerIds, modifier: "INCLUDES" };
    if (tagIds.length) sf.tags = { value: tagIds, modifier: "INCLUDES" };
    if (studioIds.length)
        sf.studios = { value: studioIds, modifier: "INCLUDES" };
    return Object.keys(sf).length ? sf : undefined;
}

const FIND_SCENES = /* GraphQL */ `
    query FindScenes(
        $filter: FindFilterType
        $scene_filter: SceneFilterType
    ) {
        findScenes(filter: $filter, scene_filter: $scene_filter) {
            count
            scenes {
                id
                title
                details
                rating100
                o_counter
                date
                paths {
                    stream
                    screenshot
                    preview
                }
                sceneStreams {
                    url
                    mime_type
                    label
                }
                files {
                    duration
                }
                performers {
                    id
                    name
                    image_path
                }
                studio {
                    id
                    name
                }
                tags {
                    id
                    name
                }
            }
        }
    }
`;

export function findScenes(variables: FindScenesVariables = {}) {
    const merged: FindScenesVariables = {
        filter: {
            page: 1,
            per_page: 20,
            sort: "random",
            direction: "DESC",
            ...variables.filter,
        },
        scene_filter: variables.scene_filter,
    };
    return gql<FindScenesResult>(
        FIND_SCENES,
        merged as unknown as Record<string, unknown>
    );
}

// ── Pickers: search performers / tags / studios ──────────────────────

export interface PickerResult {
    id: string;
    name: string;
    image_path?: string | null;
}

const FIND_PERFORMERS = /* GraphQL */ `
    query FindPerformers($filter: FindFilterType) {
        findPerformers(filter: $filter) {
            performers {
                id
                name
                image_path
            }
        }
    }
`;

const FIND_TAGS = /* GraphQL */ `
    query FindTags($filter: FindFilterType) {
        findTags(filter: $filter) {
            tags {
                id
                name
            }
        }
    }
`;

const FIND_STUDIOS = /* GraphQL */ `
    query FindStudios($filter: FindFilterType) {
        findStudios(filter: $filter) {
            studios {
                id
                name
            }
        }
    }
`;

export async function findPerformersForPicker(q: string): Promise<PickerResult[]> {
    const data = await gql<{
        findPerformers: { performers: PickerResult[] };
    }>(FIND_PERFORMERS, {
        filter: { q, page: 1, per_page: 12, sort: "name", direction: "ASC" },
    });
    return data.findPerformers.performers;
}

export async function findTagsForPicker(q: string): Promise<PickerResult[]> {
    const data = await gql<{ findTags: { tags: PickerResult[] } }>(
        FIND_TAGS,
        {
            filter: { q, page: 1, per_page: 12, sort: "name", direction: "ASC" },
        }
    );
    return data.findTags.tags;
}

export async function findStudiosForPicker(q: string): Promise<PickerResult[]> {
    const data = await gql<{
        findStudios: { studios: PickerResult[] };
    }>(FIND_STUDIOS, {
        filter: { q, page: 1, per_page: 12, sort: "name", direction: "ASC" },
    });
    return data.findStudios.studios;
}
