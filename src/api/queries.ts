import { gql } from "./graphql";
import { readDemoMode } from "../home/pluginSettings";
import * as demo from "../demo/demoContent";

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
    files: { duration: number; path: string }[];
    performers: {
        id: string;
        name: string;
        image_path: string | null;
        favorite: boolean;
        gender: string | null;
    }[];
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
        // Stash's free-text search across scene title / details / file
        // path. Drives the Explore search bar.
        q?: string;
    };
    // Loose typing so we can pass either binge's structured chip filter
    // (built via buildSceneFilter) OR a Stash saved filter's
    // object_filter JSON pass-through (rating100, play_count, date, etc.
    // — anything Stash's SceneFilterType accepts).
    scene_filter?: Record<string, unknown>;
}

// Tags whose scenes are silently hidden EVERYWHERE in binge (Home feed,
// stories, For You reel, Explore). The curated trans + scat set carried
// over from the old showcase exclusion — applied unconditionally, with no
// toggle and no filter chip. `depth: 0` matches exactly these tag ids.
export const HIDDEN_TAG_IDS: ReadonlyArray<string> = [
    "1985", "646", "647", "350", "1994", "645", "1611", "5",
    "648", "657", "1984", "660", "667", "2404", "1250", "1094",
    "1610", "1514", "644", "2259", "1933", "1961", "1942", "1956",
    "1927", "2073",
];
// GraphQL fragment for the inline-string query builders below: drops any
// scene carrying one of the hidden tags.
const HIDDEN_TAGS_CLAUSE = `tags: {
                    value: [${HIDDEN_TAG_IDS.map((id) => `"${id}"`).join(", ")}]
                    excludes: []
                    modifier: EXCLUDES
                    depth: 0
                }`;
// Merge the hidden-tag exclusion into a (possibly chip- or saved-filter-
// derived) scene_filter object for the generic findScenes() path. Adds the
// ids to the tags filter's `excludes` sub-list so it composes with an
// existing INCLUDES chip instead of clobbering it; falls back to a clean
// EXCLUDES filter when no tag criterion is present.
function withHiddenTagsExcluded(
    sf: Record<string, unknown> | undefined
): Record<string, unknown> {
    const next: Record<string, unknown> = { ...(sf ?? {}) };
    const existing = next.tags as
        | { value?: string[]; excludes?: string[]; modifier?: string; depth?: number }
        | undefined;
    if (!existing) {
        next.tags = {
            value: HIDDEN_TAG_IDS,
            excludes: [],
            modifier: "EXCLUDES",
            depth: 0,
        };
    } else {
        next.tags = {
            ...existing,
            excludes: [...(existing.excludes ?? []), ...HIDDEN_TAG_IDS],
        };
    }
    return next;
}

// Performer genders silently hidden EVERYWHERE (mirrors HIDDEN_GENDERS in
// pluginSettings). Any scene featuring such a performer is dropped from
// the feed, stories, reel, and explore — independent of tags. The tag
// exclusion only catches trans-TAGGED scenes; this closes the gap for
// trans performers whose scenes aren't tagged. Stash's scene_filter has
// no performer-gender field, so we filter client-side on the gender we
// select in each scene query.
const HIDDEN_GENDER_VALUES = new Set([
    "TRANSGENDER_FEMALE",
    "TRANSGENDER_MALE",
]);
function sceneHasHiddenPerformer(
    performers: ReadonlyArray<{ gender?: string | null }> | null | undefined
): boolean {
    return !!performers?.some(
        (p) => !!p.gender && HIDDEN_GENDER_VALUES.has(p.gender)
    );
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
                    path
                }
                performers {
                    id
                    name
                    image_path
                    favorite
                    gender
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

export async function findScenes(
    variables: FindScenesVariables = {}
): Promise<FindScenesResult> {
    if (readDemoMode()) return demo.findScenes(variables);
    const merged: FindScenesVariables = {
        filter: {
            page: 1,
            per_page: 20,
            sort: "random",
            direction: "DESC",
            ...variables.filter,
        },
        scene_filter: withHiddenTagsExcluded(variables.scene_filter),
    };
    // Double-cast: `merged` is well-typed but `gql<T>`'s variables
    // param is the loosely-typed `Record<string, unknown>` shape. TS
    // refuses the implicit narrowing because the nested filter
    // objects have non-string fields. The shape IS correct at runtime
    // — the GraphQL server validates against the schema.
    const data = await gql<FindScenesResult>(
        FIND_SCENES,
        merged as unknown as Record<string, unknown>
    );
    // Drop scenes featuring a hidden-gender (trans) performer — the
    // server has no performer-gender filter, so we strip them here.
    const scenes = data.findScenes.scenes.filter(
        (s) => !sceneHasHiddenPerformer(s.performers)
    );
    return { findScenes: { ...data.findScenes, scenes } };
}

// ── Stash saved filters ──────────────────────────────────────────────

// Stash's native saved-filter records. `object_filter` is a JSON
// scalar — its shape depends on the filter's mode but for SCENES it
// matches SceneFilterType keys (performers, tags, rating100, etc.).
// We treat it as an opaque object that's passed straight back to
// findScenes when the user applies a saved filter.
export interface StashSavedFilter {
    id: string;
    name: string;
    find_filter: {
        q: string | null;
        sort: string | null;
        direction: "ASC" | "DESC" | null;
    } | null;
    object_filter: Record<string, unknown>;
}

const FIND_SAVED_FILTERS = /* GraphQL */ `
    query SavedFiltersForScenes {
        findSavedFilters(mode: SCENES) {
            id
            name
            find_filter {
                q
                sort
                direction
            }
            object_filter
        }
    }
`;

export async function findSavedFiltersForScenes(): Promise<
    StashSavedFilter[]
> {
    const data = await gql<{ findSavedFilters: StashSavedFilter[] }>(
        FIND_SAVED_FILTERS
    );
    return data.findSavedFilters;
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

// Exact-match tag lookup by name. Used by favourites.ts to find ASR's
// "Favourite ★" tag (or create it on first use).
const FIND_TAG_BY_NAME = /* GraphQL */ `
    query FindTagByName($name: String!) {
        findTags(
            tag_filter: { name: { value: $name, modifier: EQUALS } }
            filter: { per_page: 1 }
        ) {
            tags {
                id
                name
                parents {
                    id
                }
            }
        }
    }
`;

export async function findTagByName(name: string): Promise<{
    id: string;
    name: string;
    parents: { id: string }[];
} | null> {
    const data = await gql<{
        findTags: {
            tags: {
                id: string;
                name: string;
                parents: { id: string }[];
            }[];
        };
    }>(FIND_TAG_BY_NAME, { name });
    return data.findTags.tags[0] ?? null;
}

// Tags pulled from the user's most-recently-liked scenes. Powers the
// Explore chip-strip fallback when binge's local interaction ring is
// empty. The shape is: take the N most-recently-O-counter-bumped
// scenes, aggregate their tags by frequency, return the top M.
//
// Why this over a global "most-used tags": global popularity skews
// toward whatever-the-library-has-most-of, which doesn't match the
// user's actual taste. Their recent likes do.
const FIND_RECENTLY_LIKED_SCENES = /* GraphQL */ `
    query FindRecentlyLikedScenes($perPage: Int!) {
        findScenes(
            scene_filter: {
                o_counter: { value: 0, modifier: GREATER_THAN }
            }
            filter: {
                page: 1
                per_page: $perPage
                sort: "last_o_at"
                direction: DESC
            }
        ) {
            scenes {
                id
                tags {
                    id
                    name
                }
            }
        }
    }
`;

export async function findRecentlyLikedTags(
    sceneSampleSize: number,
    topN: number
): Promise<{ id: string; name: string }[]> {
    // Demo: feed the Explore chip strip (fallback path) fictional tags.
    if (readDemoMode())
        return demo.findPopularTags().map((t) => ({ id: t.id, name: t.name }));
    const data = await gql<{
        findScenes: {
            scenes: { id: string; tags: { id: string; name: string }[] }[];
        };
    }>(FIND_RECENTLY_LIKED_SCENES, { perPage: sceneSampleSize });
    // Aggregate by frequency; remember insertion order via the Map so
    // ties resolve in favour of the more-recently-encountered tag
    // (i.e. tags from the freshest likes win when counts are equal).
    // ASR/APR rating tags + binge collection tags are filtered out —
    // they're plumbing, not topics worth surfacing as suggestions.
    const counts = new Map<
        string,
        { tag: { id: string; name: string }; count: number }
    >();
    const { isSystemTag } = await import("./tagFilters");
    for (const s of data.findScenes.scenes) {
        for (const t of s.tags) {
            if (isSystemTag(t.name)) continue;
            const existing = counts.get(t.id);
            if (existing) {
                existing.count++;
            } else {
                counts.set(t.id, { tag: t, count: 1 });
            }
        }
    }
    return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, topN)
        .map((x) => x.tag);
}

// Substring match. Used to discover all binge-collection tags (each
// ends in " 📁") in one query at app start.
const FIND_TAGS_CONTAINING = /* GraphQL */ `
    query FindTagsContaining($needle: String!) {
        findTags(
            tag_filter: { name: { value: $needle, modifier: INCLUDES } }
            filter: { per_page: -1 }
        ) {
            tags {
                id
                name
            }
        }
    }
`;

export async function findTagsContaining(
    needle: string
): Promise<{ id: string; name: string }[]> {
    if (readDemoMode()) return demo.findTagsContaining(needle);
    const data = await gql<{
        findTags: { tags: { id: string; name: string }[] };
    }>(FIND_TAGS_CONTAINING, { needle });
    return data.findTags.tags;
}

// Recent scenes tagged with this tag — used by the Saved page for
// collection cover thumbnails (up to 4 in a 2×2 mosaic).
const FIND_RECENT_SCENES_FOR_TAG = /* GraphQL */ `
    query RecentScenesForTag($tagId: ID!, $perPage: Int!) {
        findScenes(
            scene_filter: {
                tags: { value: [$tagId], modifier: INCLUDES }
            }
            filter: {
                per_page: $perPage
                sort: "created_at"
                direction: DESC
            }
        ) {
            count
            scenes {
                id
                paths {
                    screenshot
                }
            }
        }
    }
`;

export interface CollectionCoverScene {
    id: string;
    screenshot: string | null;
}

export interface CollectionCover {
    count: number;
    scenes: CollectionCoverScene[];
}

export async function findRecentScenesForTag(
    tagId: string,
    limit = 4
): Promise<CollectionCover> {
    if (readDemoMode()) return demo.findRecentScenesForTag(tagId, limit);
    const data = await gql<{
        findScenes: {
            count: number;
            scenes: { id: string; paths: { screenshot: string | null } }[];
        };
    }>(FIND_RECENT_SCENES_FOR_TAG, { tagId, perPage: limit });
    return {
        count: data.findScenes.count,
        scenes: data.findScenes.scenes.map((s) => ({
            id: s.id,
            screenshot: s.paths.screenshot,
        })),
    };
}

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

// ── Following / Explore queries ──────────────────────────────────────

export interface PerformerSummary {
    id: string;
    name: string;
    image_path: string | null;
    scene_count: number | null;
    favorite: boolean | null;
}

const FIND_ALL_PERFORMERS = /* GraphQL */ `
    query AllPerformers($page: Int!, $per_page: Int!) {
        findPerformers(
            filter: {
                page: $page
                per_page: $per_page
                sort: "name"
                direction: ASC
            }
        ) {
            count
            performers {
                id
                name
                image_path
                scene_count
                favorite
            }
        }
    }
`;

export async function findAllPerformers(): Promise<PerformerSummary[]> {
    if (readDemoMode()) return demo.findAllPerformers();
    return sweepPerformers(FIND_ALL_PERFORMERS);
}

const FIND_RANDOM_PERFORMERS = /* GraphQL */ `
    query RandomPerformers($per_page: Int!) {
        findPerformers(filter: { per_page: $per_page, sort: "random" }) {
            performers {
                id
                name
                image_path
                scene_count
                favorite
            }
        }
    }
`;

// Small unpaginated sample for Explore's horizontal discover scroller.
// We pass a fresh random seed every call so refreshes really refresh.
export async function findRandomPerformers(
    count = 24
): Promise<PerformerSummary[]> {
    if (readDemoMode()) return demo.findRandomPerformers(count);
    const data = await gql<{
        findPerformers: { performers: PerformerSummary[] };
    }>(FIND_RANDOM_PERFORMERS, { per_page: count });
    return data.findPerformers.performers;
}

// Shared paginated sweep used by both favorites and all-performers loaders.
async function sweepPerformers(query: string): Promise<PerformerSummary[]> {
    const PER_PAGE = 250;
    const MAX_PAGES = 80; // 20k ceiling — safety net for an obvious bug
    const all: PerformerSummary[] = [];
    let page = 1;
    let totalCount = Infinity;

    while (page <= MAX_PAGES && all.length < totalCount) {
        const data = await gql<{
            findPerformers: {
                count: number;
                performers: PerformerSummary[];
            };
        }>(query, { page, per_page: PER_PAGE });
        totalCount = data.findPerformers.count;
        const pageResult = data.findPerformers.performers;
        all.push(...pageResult);
        if (pageResult.length === 0) break;
        if (pageResult.length < PER_PAGE) break;
        page++;
    }

    return all;
}

export interface PopularTag {
    id: string;
    name: string;
    scene_count: number | null;
}

const FIND_POPULAR_TAGS = /* GraphQL */ `
    query PopularTags {
        findTags(
            filter: { sort: "scenes_count", direction: DESC, per_page: 40 }
        ) {
            tags {
                id
                name
                scene_count
            }
        }
    }
`;

export async function findPopularTags(): Promise<PopularTag[]> {
    if (readDemoMode()) return demo.findPopularTags();
    const data = await gql<{ findTags: { tags: PopularTag[] } }>(
        FIND_POPULAR_TAGS
    );
    return data.findTags.tags;
}

// ── Performer profile (Instagram-style page) ─────────────────────────

export interface PerformerDetail {
    id: string;
    name: string;
    // Stash schema: `alias_list: [String!]!` — the legacy `aliases` field
    // doesn't exist on this type.
    alias_list: string[];
    favorite: boolean;
    image_path: string | null;
    details: string | null;
    country: string | null;
    birthdate: string | null;
    hair_color: string | null;
    eye_color: string | null;
    scene_count: number | null;
    gallery_count: number | null;
    o_counter: number | null;
    // 0–100 rating. Surfaced as the third stat in the profile
    // header (replaces galleries — galleries are rarely populated
    // on most Stash setups and rating is more glanceable).
    rating100: number | null;
    // `twitter` / `instagram` / `url` are @deprecated in current Stash in
    // favor of `urls: [String!]`. Keeping the deprecated fields populated
    // is the simplest path for v0; we'll migrate to `urls` if/when they
    // disappear.
    twitter: string | null;
    instagram: string | null;
    url: string | null;
    urls: string[] | null;
    tags: { id: string; name: string }[];
    // Linked stashbox ids — used by the in-profile StashDB mixin
    // (PerformerSceneGrid pulls StashDB scenes by this performer's
    // stash_id when one points at stashdb.org/graphql).
    stash_ids: { endpoint: string; stash_id: string }[];
}

const FIND_PERFORMER = /* GraphQL */ `
    query PerformerDetail($id: ID!) {
        findPerformer(id: $id) {
            id
            name
            alias_list
            favorite
            image_path
            details
            country
            birthdate
            hair_color
            eye_color
            scene_count
            gallery_count
            o_counter
            rating100
            twitter
            instagram
            url
            urls
            tags {
                id
                name
            }
            stash_ids {
                endpoint
                stash_id
            }
        }
    }
`;

export async function findPerformer(id: string): Promise<PerformerDetail> {
    if (readDemoMode()) return demo.findPerformer(id);
    const data = await gql<{ findPerformer: PerformerDetail }>(FIND_PERFORMER, {
        id,
    });
    return data.findPerformer;
}

// Lightweight scene card shape — just what the profile grid renders.
// width/height feed the hover zoom-out behavior for landscape-source
// thumbnails. preview is the WebM clip Stash generates for hover playback.
export interface PerformerSceneCard {
    id: string;
    title: string | null;
    // Release date (YYYY-MM-DD) — used to sort library scenes against
    // StashDB scenes when the profile-mixin toggle is on. Null when
    // not set in Stash; sorts to the end in that case.
    date: string | null;
    // Import time (ISO). The "Recent" sort falls back to this when a
    // scene has no release date, mirroring the Home feed's effectiveAt
    // (date ?? created_at). Used by the client-side grid comparator.
    created_at: string | null;
    o_counter: number | null;
    play_count: number | null;
    paths: { screenshot: string; preview: string | null };
    files: { duration: number; width: number; height: number }[];
}

// Sort options for the performer scene grid. `stashSort` is the
// findScenes `sort:` key (validated against the live Stash schema —
// the rating key is "rating", NOT "rating100"). All sorts run DESC.
// "recent" is release-date with a client-side fallback to created_at
// (see PerformerSceneGrid's effectiveAt comparator).
export type PerformerSceneSort =
    | "recent"
    | "views"
    | "orgasms"
    | "rating"
    | "added";

export const PERFORMER_SCENE_SORTS: {
    key: PerformerSceneSort;
    label: string;
    stashSort: string;
}[] = [
    { key: "recent", label: "Recent", stashSort: "date" },
    { key: "views", label: "Most views", stashSort: "play_count" },
    { key: "orgasms", label: "Most orgasms", stashSort: "o_counter" },
    { key: "rating", label: "Highest rated", stashSort: "rating" },
    { key: "added", label: "Recently added", stashSort: "created_at" },
];

export function performerSceneStashSort(sort: PerformerSceneSort): string {
    return (
        PERFORMER_SCENE_SORTS.find((s) => s.key === sort)?.stashSort ?? "date"
    );
}

const FIND_SCENES_BY_PERFORMER = /* GraphQL */ `
    query PerformerScenes(
        $id: ID!
        $page: Int!
        $per_page: Int!
        $sort: String!
    ) {
        findScenes(
            scene_filter: {
                performers: { value: [$id], modifier: INCLUDES }
            }
            filter: {
                page: $page
                per_page: $per_page
                sort: $sort
                direction: DESC
            }
        ) {
            count
            scenes {
                id
                title
                date
                created_at
                o_counter
                play_count
                paths {
                    screenshot
                    preview
                }
                files {
                    duration
                    width
                    height
                }
            }
        }
    }
`;

export async function findScenesByPerformer(
    performerId: string,
    page: number,
    perPage: number,
    sort: PerformerSceneSort = "recent"
): Promise<{ count: number; scenes: PerformerSceneCard[] }> {
    if (readDemoMode())
        return demo.findScenesByPerformer(performerId, page, perPage, sort);
    const data = await gql<{
        findScenes: { count: number; scenes: PerformerSceneCard[] };
    }>(FIND_SCENES_BY_PERFORMER, {
        id: performerId,
        page,
        per_page: perPage,
        sort: performerSceneStashSort(sort),
    });
    return data.findScenes;
}

// Scenes filtered by a single tag id, paginated like the performer grid.
// Used by the Saved collection detail view (one tag per collection).
const FIND_SCENES_BY_TAG = /* GraphQL */ `
    query TagScenes($id: ID!, $page: Int!, $per_page: Int!) {
        findScenes(
            scene_filter: {
                tags: { value: [$id], modifier: INCLUDES }
            }
            filter: {
                page: $page
                per_page: $per_page
                sort: "created_at"
                direction: DESC
            }
        ) {
            count
            scenes {
                id
                title
                o_counter
                play_count
                paths {
                    screenshot
                    preview
                }
                files {
                    duration
                    width
                    height
                }
            }
        }
    }
`;

export async function findScenesByTag(
    tagId: string,
    page: number,
    perPage: number
): Promise<{ count: number; scenes: PerformerSceneCard[] }> {
    if (readDemoMode()) return demo.findScenesByTag(tagId, page, perPage);
    const data = await gql<{
        findScenes: { count: number; scenes: PerformerSceneCard[] };
    }>(FIND_SCENES_BY_TAG, {
        id: tagId,
        page,
        per_page: perPage,
    });
    return data.findScenes;
}

// Single-scene lookup, returning the full BingeScene shape the Reel renders.
// Used to "pin" a tapped scene at the top of the reel when the user enters
// from a performer profile card.
const FIND_SCENE = /* GraphQL */ `
    query FindScene($id: ID!) {
        findScene(id: $id) {
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
                path
            }
            performers {
                id
                name
                image_path
                favorite
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
`;

export async function findSceneById(id: string): Promise<BingeScene | null> {
    if (readDemoMode()) return demo.findSceneById(id);
    const data = await gql<{ findScene: BingeScene | null }>(FIND_SCENE, {
        id,
    });
    return data.findScene;
}

// Tech-details fetch for the SceneDetailsSheet's "Technical"
// section. Kept separate from the heavy BingeScene selection so
// we don't pull these fields on every reel slide — only when
// the user actually expands the details sheet. Mirrors the
// iOS SceneDetailsSheet's tech block.
export interface SceneFileDetails {
    path: string | null;
    width: number | null;
    height: number | null;
    duration: number | null;
    size: number | null;
    video_codec: string | null;
    audio_codec: string | null;
    frame_rate: number | null;
    bit_rate: number | null;
}

export async function fetchSceneFileDetails(
    sceneId: string
): Promise<SceneFileDetails | null> {
    const data = await gql<{
        findScene: {
            files: SceneFileDetails[];
        } | null;
    }>(
        /* GraphQL */ `
            query SceneFileDetails($id: ID!) {
                findScene(id: $id) {
                    files {
                        path
                        width
                        height
                        duration
                        size
                        video_codec
                        audio_codec
                        frame_rate
                        bit_rate
                    }
                }
            }
        `,
        { id: sceneId }
    );
    return data.findScene?.files?.[0] ?? null;
}

// Batch-fetch scenes by id in parallel, preserving the input order
// (and dropping any that returned null — deleted scenes, etc).
// Used by the Reel's queue mode (pinnedQueue from TabContext) to
// render a deterministic ordered list from e.g. a performer profile.
//
// Stash's findScenes filter doesn't accept an `ids` array cleanly,
// so we parallelize single-fetches. For a typical performer grid
// (~24-60 ids) that's well within reasonable network budgets.
export async function findScenesByIds(
    ids: string[]
): Promise<BingeScene[]> {
    if (ids.length === 0) return [];
    const results = await Promise.all(ids.map((id) => findSceneById(id)));
    const out: BingeScene[] = [];
    for (const s of results) if (s != null) out.push(s);
    return out;
}

// ── Stories: recent scenes (any performer) ──────────────────────────

// Flat row returned by the recent-scenes query. One row per (scene, performer)
// pair — a scene with N performers contributes N rows so callers can group
// per-performer without re-querying for performer detail.
export interface RecentSceneRow {
    sceneId: string;
    sceneTitle: string | null;
    sceneDetails: string | null;
    sceneScreenshot: string | null;
    scenePreview: string | null;
    sceneCreatedAt: string;
    sceneDate: string | null;
    // First file's width/height. Used to decide cover vs contain in the
    // story viewer — portrait scenes look better cover-cropped to the
    // 9:16 card; landscape scenes need contain to avoid losing half
    // the frame. Null when Stash hasn't probed the file yet.
    sceneWidth: number | null;
    sceneHeight: number | null;
    // Scene-level tag list. Carried on every row (same scene → same
    // tags), so callers can dedupe down to one item per scene and read
    // tags off any row.
    sceneTags: { id: string; name: string }[];
    performerId: string;
    performerName: string;
    performerImagePath: string | null;
    performerFavorite: boolean;
    performerGender: string | null;
}

function buildFindRecentScenesQuery(): string {
    return /* GraphQL */ `
    query RecentScenes($since: String!, $per_page: Int!) {
        findScenes(
            scene_filter: {
                created_at: { value: $since, modifier: GREATER_THAN }
                ${HIDDEN_TAGS_CLAUSE}
            }
            filter: {
                page: 1
                per_page: $per_page
                sort: "created_at"
                direction: DESC
            }
        ) {
            scenes {
                id
                title
                details
                created_at
                date
                files {
                    width
                    height
                }
                paths {
                    screenshot
                    preview
                }
                performers {
                    id
                    name
                    image_path
                    favorite
                    gender
                }
                tags {
                    id
                    name
                }
            }
        }
    }
`;
}

// Same row shape, but filtered by scene release date instead of
// library-add date. The user has scenes whose `date` is recent but
// whose `created_at` is months/years old; they wouldn't show up in
// the created_at-filtered query above. We run both and merge by id.
function buildFindScenesByDateQuery(): string {
    return /* GraphQL */ `
    query ScenesByDate($since: String!, $per_page: Int!) {
        findScenes(
            scene_filter: {
                date: { value: $since, modifier: GREATER_THAN }
                ${HIDDEN_TAGS_CLAUSE}
            }
            filter: {
                page: 1
                per_page: $per_page
                sort: "date"
                direction: DESC
            }
        ) {
            scenes {
                id
                title
                details
                created_at
                date
                files {
                    width
                    height
                }
                paths {
                    screenshot
                    preview
                }
                performers {
                    id
                    name
                    image_path
                    favorite
                    gender
                }
                tags {
                    id
                    name
                }
            }
        }
    }
`;
}

// Fetch scenes added to the library newer than `sinceIso`, regardless of
// performer. Returns a flattened list — one row per scene/performer pair —
// with performer name/image/favorite inlined so the Home page can build
// per-performer stories without a second query.
//
// per_page caps the result. 500 is generous for a 30-day lookback; if a
// user has unusually heavy ingest cadence and hits the cap, the most
// recent scenes are kept (sort DESC).
// Shared shape returned by both FIND_RECENT_SCENES (created_at filter)
// and FIND_SCENES_BY_DATE (date filter). Identical fields; the only
// difference is the WHERE clause.
type RawSceneNode = {
    id: string;
    title: string | null;
    details: string | null;
    created_at: string;
    date: string | null;
    files: { width: number; height: number }[];
    paths: {
        screenshot: string | null;
        preview: string | null;
    };
    performers: {
        id: string;
        name: string;
        image_path: string | null;
        favorite: boolean;
        gender: string | null;
    }[];
    tags: { id: string; name: string }[];
};

function flattenSceneNodes(scenes: RawSceneNode[]): RecentSceneRow[] {
    const rows: RecentSceneRow[] = [];
    for (const s of scenes) {
        // Drop the whole scene if any performer is a hidden gender
        // (trans) — covers the Home feed + stories row in one place.
        if (sceneHasHiddenPerformer(s.performers)) continue;
        const firstFile = s.files?.[0];
        const sceneTags = s.tags ?? [];
        // Stash can occasionally return a scene with null `performers`
        // during partial writes — guard so one bad row doesn't crash
        // the whole feed flatten.
        for (const p of s.performers ?? []) {
            rows.push({
                sceneId: s.id,
                sceneTitle: s.title,
                sceneDetails: s.details,
                sceneScreenshot: s.paths.screenshot,
                scenePreview: s.paths.preview,
                sceneCreatedAt: s.created_at,
                sceneDate: s.date,
                sceneWidth: firstFile?.width ?? null,
                sceneHeight: firstFile?.height ?? null,
                sceneTags,
                performerId: p.id,
                performerName: p.name,
                performerImagePath: p.image_path,
                performerFavorite: p.favorite,
                performerGender: p.gender ?? null,
            });
        }
    }
    return rows;
}

export async function findRecentScenes(
    sinceIso: string,
    perPage = 500
): Promise<RecentSceneRow[]> {
    if (readDemoMode()) return demo.findRecentScenes();
    const data = await gql<{ findScenes: { scenes: RawSceneNode[] } }>(
        buildFindRecentScenesQuery(),
        { since: sinceIso, per_page: perPage }
    );
    return flattenSceneNodes(data.findScenes.scenes);
}

// Scenes whose release date (the manually-tagged `date` field) is newer
// than `sinceDate` (YYYY-MM-DD). Run alongside findRecentScenes so we
// also catch scenes added to the library long ago but with a recent
// release date — without this, a freshly-released scene that was
// imported a year ago would be invisible to the Home feed.
export async function findScenesByDate(
    sinceDate: string,
    perPage = 500
): Promise<RecentSceneRow[]> {
    if (readDemoMode()) return demo.findRecentScenes();
    const data = await gql<{ findScenes: { scenes: RawSceneNode[] } }>(
        buildFindScenesByDateQuery(),
        { since: sinceDate, per_page: perPage }
    );
    return flattenSceneNodes(data.findScenes.scenes);
}

// ── Performer photos / lightbox ─────────────────────────────────────

// Image card shape for the Photos grid + lightbox. paths.image is the
// full-resolution source for the lightbox; paths.thumbnail is the grid
// thumb. visual_files carries width/height so the lightbox can sit
// portrait images at native aspect ratio.
export interface PerformerImageCard {
    id: string;
    title: string | null;
    o_counter: number | null;
    paths: { thumbnail: string | null; image: string | null };
    visual_files: { width: number; height: number }[];
}

const FIND_IMAGES_BY_PERFORMER = /* GraphQL */ `
    query PerformerImages($id: ID!, $page: Int!, $per_page: Int!) {
        findImages(
            image_filter: {
                performers: { value: [$id], modifier: INCLUDES }
            }
            filter: {
                page: $page
                per_page: $per_page
                sort: "created_at"
                direction: DESC
            }
        ) {
            count
            images {
                id
                title
                o_counter
                paths {
                    thumbnail
                    image
                }
                visual_files {
                    ... on ImageFile {
                        width
                        height
                    }
                }
            }
        }
    }
`;

export async function findImagesByPerformer(
    performerId: string,
    page: number,
    perPage: number
): Promise<{ count: number; images: PerformerImageCard[] }> {
    const data = await gql<{
        findImages: { count: number; images: PerformerImageCard[] };
    }>(FIND_IMAGES_BY_PERFORMER, {
        id: performerId,
        page,
        per_page: perPage,
    });
    return data.findImages;
}

// ── Recent galleries (Home feed) ────────────────────────────────────

// Gallery row returned for the feed. Cover + image_count are enough to
// render the card shell; the first N images come from a separate
// findImagesByGallery call so the metadata query stays lean.
export interface RecentGalleryRow {
    galleryId: string;
    title: string | null;
    coverPath: string | null;
    imageCount: number;
    createdAt: string;
    date: string | null;
    // The gallery's folder.path (for folder-based galleries) plus any
    // file paths (for zip/archive galleries). Used to filter out
    // screenshot/cover-art galleries the user doesn't want surfaced
    // in the Home feed.
    paths: string[];
    performers: {
        id: string;
        name: string;
        image_path: string | null;
        favorite: boolean;
    }[];
}

const FIND_RECENT_GALLERIES = /* GraphQL */ `
    query RecentGalleries($since: String!, $per_page: Int!) {
        findGalleries(
            gallery_filter: {
                created_at: { value: $since, modifier: GREATER_THAN }
            }
            filter: {
                page: 1
                per_page: $per_page
                sort: "created_at"
                direction: DESC
            }
        ) {
            galleries {
                id
                title
                created_at
                date
                image_count
                folder {
                    path
                }
                files {
                    path
                }
                cover {
                    paths {
                        thumbnail
                    }
                }
                performers {
                    id
                    name
                    image_path
                    favorite
                }
            }
        }
    }
`;

type RawGalleryNode = {
    id: string;
    title: string | null;
    created_at: string;
    date: string | null;
    image_count: number;
    folder: { path: string } | null;
    files: { path: string }[];
    cover: { paths: { thumbnail: string | null } } | null;
    performers: {
        id: string;
        name: string;
        image_path: string | null;
        favorite: boolean;
    }[];
};

function mapGalleryNodes(galleries: RawGalleryNode[]): RecentGalleryRow[] {
    return galleries.map((g) => {
        const paths: string[] = [];
        if (g.folder?.path) paths.push(g.folder.path);
        for (const f of g.files ?? []) {
            if (f.path) paths.push(f.path);
        }
        return {
            galleryId: g.id,
            title: g.title,
            coverPath: g.cover?.paths.thumbnail ?? null,
            imageCount: g.image_count,
            createdAt: g.created_at,
            date: g.date,
            paths,
            performers: g.performers,
        };
    });
}

export async function findRecentGalleries(
    sinceIso: string,
    perPage = 50
): Promise<RecentGalleryRow[]> {
    const data = await gql<{
        findGalleries: { galleries: RawGalleryNode[] };
    }>(FIND_RECENT_GALLERIES, { since: sinceIso, per_page: perPage });
    return mapGalleryNodes(data.findGalleries.galleries);
}

const FIND_GALLERIES_BY_DATE = /* GraphQL */ `
    query GalleriesByDate($since: String!, $per_page: Int!) {
        findGalleries(
            gallery_filter: {
                date: { value: $since, modifier: GREATER_THAN }
            }
            filter: {
                page: 1
                per_page: $per_page
                sort: "date"
                direction: DESC
            }
        ) {
            galleries {
                id
                title
                created_at
                date
                image_count
                folder {
                    path
                }
                files {
                    path
                }
                cover {
                    paths {
                        thumbnail
                    }
                }
                performers {
                    id
                    name
                    image_path
                    favorite
                }
            }
        }
    }
`;

// Galleries whose release date is newer than `sinceDate` (YYYY-MM-DD).
// Counterpart to findScenesByDate — catches galleries with a recent
// manually-tagged date even if they were imported long ago.
export async function findGalleriesByDate(
    sinceDate: string,
    perPage = 50
): Promise<RecentGalleryRow[]> {
    const data = await gql<{
        findGalleries: { galleries: RawGalleryNode[] };
    }>(FIND_GALLERIES_BY_DATE, { since: sinceDate, per_page: perPage });
    return mapGalleryNodes(data.findGalleries.galleries);
}

const FIND_IMAGES_BY_GALLERY = /* GraphQL */ `
    query GalleryImages($id: ID!, $per_page: Int!) {
        findImages(
            image_filter: {
                galleries: { value: [$id], modifier: INCLUDES }
            }
            filter: {
                page: 1
                per_page: $per_page
                sort: "path"
                direction: ASC
            }
        ) {
            images {
                id
                title
                o_counter
                paths {
                    thumbnail
                    image
                }
                visual_files {
                    ... on ImageFile {
                        width
                        height
                    }
                }
            }
        }
    }
`;

// Fetch the first `perPage` images of a gallery. Sorted by path so the
// order matches Stash's gallery view (filesystem order, which is what
// the user typically authored). Reuses the PerformerImageCard shape
// so existing ImageLightbox accepts the result without adaptation.
export async function findImagesByGallery(
    galleryId: string,
    perPage: number
): Promise<PerformerImageCard[]> {
    const data = await gql<{
        findImages: { images: PerformerImageCard[] };
    }>(FIND_IMAGES_BY_GALLERY, {
        id: galleryId,
        per_page: perPage,
    });
    return data.findImages.images;
}

// Fetch the Stash instance's API key. Same-origin clients have access
// to `configuration.general.apiKey` via the user's auth cookie, so
// binge can read it without the user copy-pasting. Used to pre-fill
// binge-server's stashApiKey config on first run.
const CONFIGURATION_API_KEY = /* GraphQL */ `
    query ConfigurationApiKey {
        configuration {
            general {
                apiKey
            }
        }
    }
`;
export async function fetchStashApiKey(): Promise<string> {
    const data = await gql<{
        configuration: { general: { apiKey: string } };
    }>(CONFIGURATION_API_KEY);
    return data.configuration.general.apiKey ?? "";
}
