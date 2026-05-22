import { gql } from "./graphql";
import {
    getStashDBBox,
    getStashDBPerformer,
    getStashDBScene,
    type StashDBPerformerDetail,
    type StashDBSceneDetail,
} from "./stashdb";

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

// ── Follow-from-StashDB (discovery feature) ─────────────────────────
//
// Two-step:
//   1. `scrapeSinglePerformer` pulls full performer metadata from
//      StashDB via Stash's built-in stashbox scraper. Returns the
//      shape Stash uses internally for scraped performers — most of
//      which slots straight into `PerformerCreateInput`.
//   2. `performerCreate` writes the new local performer with the
//      scraped data + a stash_ids link back to StashDB.
//
// On scrape failure we still call performerCreate with a minimal
// fallback (just name + image + stash_id) so the user isn't blocked
// — they can manually scrape from Stash later to fill metadata.

const SCRAPE_STASHBOX_PERFORMER = /* GraphQL */ `
    query ScrapeStashBoxPerformer(
        $stash_box_index: Int!
        $stash_id: String!
    ) {
        scrapeSinglePerformer(
            source: { stash_box_index: $stash_box_index }
            input: { performer_id: $stash_id }
        ) {
            name
            disambiguation
            gender
            url
            twitter
            instagram
            birthdate
            ethnicity
            country
            eye_color
            hair_color
            height
            measurements
            fake_tits
            penis_length
            circumcised
            career_length
            tattoos
            piercings
            aliases
            images
            details
            death_date
            hair_color
            weight
            remote_site_id
        }
    }
`;

export interface ScrapedPerformer {
    name: string | null;
    disambiguation?: string | null;
    gender?: string | null;
    url?: string | null;
    twitter?: string | null;
    instagram?: string | null;
    birthdate?: string | null;
    ethnicity?: string | null;
    country?: string | null;
    eye_color?: string | null;
    hair_color?: string | null;
    height?: string | null;
    measurements?: string | null;
    fake_tits?: string | null;
    penis_length?: string | null;
    circumcised?: string | null;
    career_length?: string | null;
    tattoos?: string | null;
    piercings?: string | null;
    aliases?: string | null;
    images?: string[] | null;
    details?: string | null;
    death_date?: string | null;
    weight?: string | null;
    remote_site_id?: string | null;
}

// Fetch the full StashDB performer record (name, demographics,
// images, etc.) via StashDB's own GraphQL — NOT through Stash's
// scraper. Stash's `scrapeSinglePerformer` expects a search query
// rather than a stash_id, so hitting StashDB directly is both
// simpler and gives us the full images array for the modal's
// photo carousel.
export async function getStashDBPerformerForFollow(
    stashId: string
): Promise<StashDBPerformerDetail | null> {
    const box = await getStashDBBox();
    if (!box) return null;
    return getStashDBPerformer(stashId, box.api_key);
}

// Editable form — mirrors the field set of Stash's own
// `PerformerEditPanel` (PerformerCreateInput in the GraphQL
// schema) so the modal feels like Stash's "Add Performer" flow.
// Strings are trimmed + empty values dropped at submit time.
export interface PerformerCreateForm {
    name: string;
    disambiguation: string;
    alias_list: string; // comma-separated
    gender: string;
    birthdate: string; // YYYY-MM-DD
    death_date: string;
    country: string;
    ethnicity: string;
    hair_color: string;
    eye_color: string;
    height_cm: string; // numeric in cm
    weight: string; // numeric in kg
    measurements: string;
    fake_tits: string;
    penis_length: string; // numeric in cm
    circumcised: string; // "" | "CUT" | "UNCUT"
    tattoos: string;
    piercings: string;
    career_start: string;
    career_end: string;
    urls: string; // newline-separated
    details: string;
    ignore_auto_tag: boolean;
    image: string; // URL
    stashDBPerformerId: string;
}

export function buildPerformerCreateForm(args: {
    stashDBPerformerId: string;
    fallbackName: string;
    fallbackImage: string | null;
    detail: StashDBPerformerDetail | null;
}): PerformerCreateForm {
    const d = args.detail;
    const tattoosText = (d?.tattoos ?? [])
        .map((t) =>
            t.description ? `${t.location}: ${t.description}` : t.location
        )
        .join("\n");
    const piercingsText = (d?.piercings ?? [])
        .map((p) =>
            p.description ? `${p.location}: ${p.description}` : p.location
        )
        .join("\n");
    // StashDB returns career years; Stash stores ISO date strings.
    // Promote start_year → YYYY-01-01 and end_year → YYYY-12-31 so
    // the dates land in the right year.
    const careerStart = d?.careerStartYear
        ? `${d.careerStartYear}-01-01`
        : "";
    const careerEnd = d?.careerEndYear ? `${d.careerEndYear}-12-31` : "";
    const urlsText = (d?.urls ?? []).map((u) => u.url).join("\n");
    // Map StashDB breast_type → Stash's fake_tits string. Stash
    // historically writes "Yes" / "No" / "" for this field.
    const fakeTits =
        d?.breastType === "FAKE"
            ? "Yes"
            : d?.breastType === "NATURAL"
              ? "No"
              : "";

    return {
        name: (d?.name?.trim() || args.fallbackName).trim(),
        disambiguation: d?.disambiguation ?? "",
        alias_list: (d?.aliases ?? []).join(", "),
        gender: d?.gender ?? "",
        birthdate: d?.birthDate ?? "",
        death_date: "",
        country: d?.country ?? "",
        ethnicity: d?.ethnicity ?? "",
        hair_color: d?.hairColor ?? "",
        eye_color: d?.eyeColor ?? "",
        height_cm: d?.height ? String(d.height) : "",
        weight: "",
        measurements: d?.measurements ?? "",
        fake_tits: fakeTits,
        penis_length: "",
        circumcised: "",
        tattoos: tattoosText,
        piercings: piercingsText,
        career_start: careerStart,
        career_end: careerEnd,
        urls: urlsText,
        details: "",
        ignore_auto_tag: false,
        image: d?.images?.[0]?.url ?? args.fallbackImage ?? "",
        stashDBPerformerId: args.stashDBPerformerId,
    };
}

const PERFORMER_CREATE = /* GraphQL */ `
    mutation PerformerCreate($input: PerformerCreateInput!) {
        performerCreate(input: $input) {
            id
            name
        }
    }
`;

const STASHDB_ENDPOINT = "https://stashdb.org/graphql";

// Submit the form. Cleans empty strings → undefined, parses numeric
// fields, and translates a few binge-form-shaped values (the
// newline-separated URL textarea, the comma-separated alias
// textarea) into the array shapes Stash expects. Always carries
// stash_ids back to StashDB so the new local performer stays
// linked.
export async function submitPerformerCreate(
    form: PerformerCreateForm
): Promise<{ id: string; name: string }> {
    const input: Record<string, unknown> = {
        name: form.name.trim(),
        stash_ids: [
            {
                endpoint: STASHDB_ENDPOINT,
                stash_id: form.stashDBPerformerId,
            },
        ],
    };
    const setIf = (key: string, value: string) => {
        const v = value.trim();
        if (v) input[key] = v;
    };
    setIf("disambiguation", form.disambiguation);
    setIf("gender", form.gender);
    setIf("birthdate", form.birthdate);
    setIf("death_date", form.death_date);
    setIf("country", form.country);
    setIf("ethnicity", form.ethnicity);
    setIf("hair_color", form.hair_color);
    setIf("eye_color", form.eye_color);
    setIf("measurements", form.measurements);
    setIf("fake_tits", form.fake_tits);
    setIf("circumcised", form.circumcised);
    setIf("tattoos", form.tattoos);
    setIf("piercings", form.piercings);
    setIf("career_start", form.career_start);
    setIf("career_end", form.career_end);
    setIf("details", form.details);
    if (form.image.trim()) input.image = form.image.trim();
    if (form.ignore_auto_tag) input.ignore_auto_tag = true;
    if (form.alias_list.trim()) {
        input.alias_list = form.alias_list
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
    }
    if (form.urls.trim()) {
        input.urls = form.urls
            .split(/\r?\n/)
            .map((u) => u.trim())
            .filter(Boolean);
    }
    const h = parseFloat(form.height_cm);
    if (Number.isFinite(h)) input.height_cm = h;
    const w = parseFloat(form.weight);
    if (Number.isFinite(w)) input.weight = w;
    const pl = parseFloat(form.penis_length);
    if (Number.isFinite(pl)) input.penis_length = pl;

    const data = await gql<{
        performerCreate: { id: string; name: string };
    }>(PERFORMER_CREATE, { input });
    return data.performerCreate;
}

export interface FollowStashDBPerformerArgs {
    stashDBPerformerId: string;
    fallbackName: string;
    fallbackImage: string | null;
    stashBoxIndex: number;
}

export async function followStashDBPerformer(
    args: FollowStashDBPerformerArgs
): Promise<{ id: string; name: string }> {
    let scraped: ScrapedPerformer | null = null;
    try {
        const data = await gql<{
            scrapeSinglePerformer: ScrapedPerformer[] | null;
        }>(SCRAPE_STASHBOX_PERFORMER, {
            stash_box_index: args.stashBoxIndex,
            stash_id: args.stashDBPerformerId,
        });
        scraped = data.scrapeSinglePerformer?.[0] ?? null;
    } catch (err) {
        // Non-fatal — fall back to a minimal create.
        console.warn("[binge] scrapeSinglePerformer failed", err);
    }

    // Build PerformerCreateInput. The scraper may return strings like
    // "180 cm" for height; Stash's create input wants the raw number.
    // For v1 we keep it simple: pass through what we can, skip
    // anything that requires parsing.
    const input: Record<string, unknown> = {
        name: scraped?.name?.trim() || args.fallbackName,
        // Always carry the stash_ids link so Stash can match this
        // performer to StashDB in the future.
        stash_ids: [
            { endpoint: STASHDB_ENDPOINT, stash_id: args.stashDBPerformerId },
        ],
    };
    const firstImage = scraped?.images?.[0] ?? args.fallbackImage;
    if (firstImage) input.image = firstImage;
    if (scraped?.disambiguation) input.disambiguation = scraped.disambiguation;
    if (scraped?.gender) input.gender = scraped.gender;
    if (scraped?.url) input.url = scraped.url;
    if (scraped?.twitter) input.twitter = scraped.twitter;
    if (scraped?.instagram) input.instagram = scraped.instagram;
    if (scraped?.birthdate) input.birthdate = scraped.birthdate;
    if (scraped?.ethnicity) input.ethnicity = scraped.ethnicity;
    if (scraped?.country) input.country = scraped.country;
    if (scraped?.eye_color) input.eye_color = scraped.eye_color;
    if (scraped?.hair_color) input.hair_color = scraped.hair_color;
    if (scraped?.details) input.details = scraped.details;
    if (scraped?.tattoos) input.tattoos = scraped.tattoos;
    if (scraped?.piercings) input.piercings = scraped.piercings;
    if (scraped?.career_length) input.career_length = scraped.career_length;
    if (scraped?.measurements) input.measurements = scraped.measurements;
    if (scraped?.aliases) input.alias_list = scraped.aliases.split(",").map((s) => s.trim()).filter(Boolean);
    if (scraped?.death_date) input.death_date = scraped.death_date;
    if (scraped?.weight) {
        const w = parseFloat(scraped.weight);
        if (Number.isFinite(w)) input.weight = w;
    }
    if (scraped?.height) {
        const h = parseFloat(scraped.height);
        if (Number.isFinite(h)) input.height_cm = h;
    }

    const data = await gql<{
        performerCreate: { id: string; name: string };
    }>(PERFORMER_CREATE, { input });
    return data.performerCreate;
}

// ── Scene scrape + create (AddSceneModal) ───────────────────────────
//
// Mirrors the performer-modal pattern: fetch the StashDB scene
// detail, hand it to the modal to populate an editable form, then
// submit via Stash's sceneCreate. Performer + studio + tag mapping
// requires looking up their local IDs by stash_id — we run those
// lookups against Stash here and pass the local IDs into the
// sceneCreate input.

export async function getStashDBSceneForCreate(
    stashDBSceneId: string
): Promise<StashDBSceneDetail | null> {
    const box = await getStashDBBox();
    if (!box) return null;
    return getStashDBScene(stashDBSceneId, box.api_key);
}

export interface SceneCreateForm {
    title: string;
    code: string;
    details: string;
    director: string;
    date: string;
    urls: string;
    cover_image: string;
    stashDBSceneId: string;
    performerIds: string[];
    studioId: string | null;
}

const FIND_PERFORMERS_BY_STASH_ID = /* GraphQL */ `
    query FindPerformersByStashIds {
        findPerformers(filter: { per_page: -1 }) {
            performers {
                id
                stash_ids {
                    endpoint
                    stash_id
                }
            }
        }
    }
`;

const FIND_STUDIOS_BY_STASH_ID = /* GraphQL */ `
    query FindStudiosByStashIds {
        findStudios(filter: { per_page: -1 }) {
            studios {
                id
                stash_ids {
                    endpoint
                    stash_id
                }
            }
        }
    }
`;

async function buildPerformerStashIdMap(
    stashIds: string[]
): Promise<Map<string, string>> {
    if (stashIds.length === 0) return new Map();
    const data = await gql<{
        findPerformers: {
            performers: {
                id: string;
                stash_ids: { endpoint: string; stash_id: string }[];
            }[];
        };
    }>(FIND_PERFORMERS_BY_STASH_ID);
    const allMap = new Map<string, string>();
    for (const p of data.findPerformers.performers) {
        for (const sid of p.stash_ids) {
            if (sid.endpoint === STASHDB_ENDPOINT) {
                allMap.set(sid.stash_id, p.id);
            }
        }
    }
    const out = new Map<string, string>();
    for (const s of stashIds) {
        const localId = allMap.get(s);
        if (localId) out.set(s, localId);
    }
    return out;
}

async function findStudioByStashId(
    stashId: string
): Promise<string | null> {
    const data = await gql<{
        findStudios: {
            studios: {
                id: string;
                stash_ids: { endpoint: string; stash_id: string }[];
            }[];
        };
    }>(FIND_STUDIOS_BY_STASH_ID);
    for (const s of data.findStudios.studios) {
        for (const sid of s.stash_ids) {
            if (
                sid.endpoint === STASHDB_ENDPOINT &&
                sid.stash_id === stashId
            ) {
                return s.id;
            }
        }
    }
    return null;
}

export async function buildSceneCreateForm(args: {
    stashDBSceneId: string;
    detail: StashDBSceneDetail | null;
}): Promise<SceneCreateForm> {
    const d = args.detail;
    const performerIds: string[] = [];
    let studioId: string | null = null;
    if (d) {
        const performerStashIds = d.performers.map((p) => p.stashId);
        const performerMap = await buildPerformerStashIdMap(
            performerStashIds
        );
        for (const sid of performerStashIds) {
            const local = performerMap.get(sid);
            if (local) performerIds.push(local);
        }
        if (d.studio) {
            studioId = await findStudioByStashId(d.studio.stashId);
        }
    }
    return {
        title: d?.title ?? "",
        code: d?.code ?? "",
        details: d?.details ?? "",
        director: d?.director ?? "",
        date: d?.releaseDate ?? "",
        urls: (d?.urls ?? []).map((u) => u.url).join("\n"),
        cover_image: d?.images?.[0]?.url ?? "",
        stashDBSceneId: args.stashDBSceneId,
        performerIds,
        studioId,
    };
}

const SCENE_CREATE = /* GraphQL */ `
    mutation SceneCreate($input: SceneCreateInput!) {
        sceneCreate(input: $input) {
            id
            title
        }
    }
`;

export async function submitSceneCreate(
    form: SceneCreateForm
): Promise<{ id: string; title: string | null }> {
    const input: Record<string, unknown> = {
        stash_ids: [
            {
                endpoint: STASHDB_ENDPOINT,
                stash_id: form.stashDBSceneId,
            },
        ],
    };
    const setIf = (key: string, value: string) => {
        const v = value.trim();
        if (v) input[key] = v;
    };
    setIf("title", form.title);
    setIf("code", form.code);
    setIf("details", form.details);
    setIf("director", form.director);
    setIf("date", form.date);
    if (form.cover_image.trim()) {
        input.cover_image = form.cover_image.trim();
    }
    if (form.urls.trim()) {
        input.urls = form.urls
            .split(/\r?\n/)
            .map((u) => u.trim())
            .filter(Boolean);
    }
    if (form.performerIds.length > 0) {
        input.performer_ids = form.performerIds;
    }
    if (form.studioId) {
        input.studio_id = form.studioId;
    }
    const data = await gql<{
        sceneCreate: { id: string; title: string | null };
    }>(SCENE_CREATE, { input });
    return data.sceneCreate;
}
