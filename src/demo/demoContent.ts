// Fictional, SFW placeholder library used in demo mode (capturing
// marketing footage). Everything here is invented — names, titles,
// studios — and all media is procedural gradients (inline SVG data
// URIs), so nothing from a real Stash library is ever shown.
//
// Demo mode is gated by `binge.demoMode` (pluginSettings). The shared
// query functions in src/api/queries.ts branch to the builders here
// when it's on; the four <video> sites swap to <DemoGradientVideo>.
//
// Mirrors the iOS demo content (same cast + structure) for brand
// consistency across captures.

import type {
    BingeScene,
    CollectionCover,
    FindScenesResult,
    FindScenesVariables,
    PerformerDetail,
    PerformerSceneCard,
    PerformerSummary,
    PopularTag,
    RecentSceneRow,
} from "../api/queries";

// ── Procedural gradients ─────────────────────────────────────────────

// FNV-1a over the seed → a stable hue in [0, 360). Good avalanche, so
// near-identical seeds (s-p1-1 vs s-p1-2) land on widely different hues.
export function hueForSeed(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % 360;
}

/** Top/bottom CSS colours for a seed — shared by the SVG data URI and
 *  the live <DemoGradientVideo> component so they match. */
export function gradientStops(seed: string): { top: string; bottom: string } {
    const hue = hueForSeed(seed);
    return {
        top: `hsl(${hue}, 52%, 60%)`,
        bottom: `hsl(${(hue + 28) % 360}, 60%, 34%)`,
    };
}

/** Inline SVG linear-gradient data URI — drops straight into <img src>
 *  and `background-image: url(...)`, so every existing cover/avatar
 *  renders a gradient with no component change. */
export function gradientDataUri(seed: string): string {
    const { top, bottom } = gradientStops(seed);
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='1280'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='${top}'/>` +
        `<stop offset='1' stop-color='${bottom}'/>` +
        `</linearGradient></defs>` +
        `<rect width='720' height='1280' fill='url(#g)'/></svg>`;
    // encodeURIComponent leaves ' ( ) unescaped — but the SVG has literal
    // single-quoted attributes plus parens (hsl(...), url(#g)). Unquoted
    // CSS url(...) (used by the pack tiles + avatars) can't contain any of
    // those, so the data URI silently fails to load → blank. Percent-
    // escape all three so it's safe as both an <img src> and a CSS url().
    const encoded = encodeURIComponent(svg)
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
    return `data:image/svg+xml,${encoded}`;
}

// ── Fictional cast ───────────────────────────────────────────────────

interface Perf {
    id: string;
    name: string;
    /** Canonical scene count shown in Following / on the profile —
     *  distinct per performer (Aria the heaviest). Decoupled from how
     *  many scenes we actually generate. */
    count: number;
}

const PERFORMERS: Perf[] = [
    { id: "p1", name: "Aria", count: 12 },
    { id: "p2", name: "Nova", count: 9 },
    { id: "p3", name: "Sable", count: 8 },
    { id: "p4", name: "Wren", count: 7 },
    { id: "p5", name: "Juno", count: 6 },
    { id: "p6", name: "Lux", count: 5 },
    { id: "p7", name: "Echo", count: 4 },
    { id: "p8", name: "Vesper", count: 3 },
    { id: "p9", name: "Iris", count: 2 },
    { id: "p10", name: "Sage", count: 1 },
];

const STUDIOS = ["Aurora Films", "Lumen Studio", "Demo Pictures"];
const TITLES = [
    "Golden Hour", "City Lights", "Studio Session", "Candid Moment",
    "Afternoon Light", "Neon Nights", "Backstage", "Sunset Drive",
    "First Light", "Close Up", "Daydream", "Soft Focus",
];
const TAG_SETS = [
    ["Golden Hour", "Outdoor"], ["City", "Portrait"],
    ["Studio", "Aesthetic"], ["Candid", "Portrait"],
    ["Aesthetic", "Solo"], ["Outdoor", "Candid"],
];

/** Stable tag id from a name, so Explore chips (findPopularTags) and
 *  scene tags share ids and tag-filtering matches. */
function tagId(name: string): string {
    return "demotag-" + name.toLowerCase().replace(/\s+/g, "-");
}

// Internal rich scene record; projected to the various query shapes.
interface DemoScene {
    id: string;
    title: string;
    details: string;
    createdAt: string;
    date: string;
    rating100: number;
    oCounter: number;
    playCount: number;
    performerIds: string[];
    studio: { id: string; name: string };
    tags: { id: string; name: string }[];
}

function isoHoursAgo(hoursAgo: number): string {
    return new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
}

// One pack (Aria) + a handful of singles from everyone else. Only Aria
// clusters enough recent scenes to collapse into a group/pack card
// (others capped at 3); co-stars rotate in and get @-mentioned.
const DEMO_SCENES: DemoScene[] = (() => {
    const out: DemoScene[] = [];
    PERFORMERS.forEach((p, pIdx) => {
        const n = pIdx === 0 ? p.count : Math.min(p.count, 3);
        for (let i = 1; i <= n; i++) {
            const coIdx = (pIdx + i) % PERFORMERS.length;
            const co =
                coIdx === pIdx || i === n ? [] : [PERFORMERS[coIdx]];
            const id = `${p.id}-${i}`;
            const tags = TAG_SETS[(pIdx + i) % TAG_SETS.length];
            const caption = co.length
                ? "with " +
                  co.map((c) => "@" + c.name.toLowerCase()).join(" ") +
                  " ✨"
                : "✨ " + tags[0];
            const hoursAgo = pIdx * 30 + i * 0.5;
            out.push({
                id,
                title: TITLES[(i - 1) % TITLES.length],
                details: caption,
                createdAt: isoHoursAgo(hoursAgo),
                date: isoHoursAgo(hoursAgo).slice(0, 10),
                rating100: 70 + (i % 4) * 7,
                oCounter: i % 5,
                playCount: (i * 3) % 11,
                performerIds: [p, ...co].map((x) => x.id),
                studio: {
                    id: `st${(pIdx + i) % STUDIOS.length}`,
                    name: STUDIOS[(pIdx + i) % STUDIOS.length],
                },
                tags: tags.map((t) => ({ id: tagId(t), name: t })),
            });
        }
    });
    return out;
})();

function perfById(id: string): Perf | undefined {
    return PERFORMERS.find((p) => p.id === id);
}

// ── Projections to query shapes ──────────────────────────────────────

function toBingeScene(d: DemoScene): BingeScene {
    return {
        id: d.id,
        title: d.title,
        details: d.details,
        rating100: d.rating100,
        o_counter: d.oCounter,
        paths: {
            stream: gradientDataUri(`s-${d.id}`),
            screenshot: gradientDataUri(`s-${d.id}`),
            preview: gradientDataUri(`s-${d.id}`),
        },
        sceneStreams: [],
        files: [{ duration: 30, path: "" }],
        performers: d.performerIds.map((pid) => {
            const p = perfById(pid)!;
            return {
                id: p.id,
                name: p.name,
                image_path: gradientDataUri(`a-${p.id}`),
                favorite: false,
                gender: "FEMALE",
            };
        }),
        studio: d.studio,
        tags: d.tags,
        date: d.date,
    };
}

function toSceneCard(d: DemoScene): PerformerSceneCard {
    return {
        id: d.id,
        title: d.title,
        date: d.date,
        o_counter: d.oCounter,
        play_count: d.playCount,
        paths: {
            screenshot: gradientDataUri(`s-${d.id}`),
            preview: gradientDataUri(`s-${d.id}`),
        },
        files: [{ duration: 30, width: 720, height: 1280 }],
    };
}

function toRecentRows(d: DemoScene): RecentSceneRow[] {
    return d.performerIds.map((pid) => {
        const p = perfById(pid)!;
        return {
            sceneId: d.id,
            sceneTitle: d.title,
            sceneDetails: d.details,
            sceneScreenshot: gradientDataUri(`s-${d.id}`),
            scenePreview: gradientDataUri(`s-${d.id}`),
            sceneCreatedAt: d.createdAt,
            sceneDate: d.date,
            sceneWidth: 720,
            sceneHeight: 1280,
            sceneTags: d.tags,
            performerId: p.id,
            performerName: p.name,
            performerImagePath: gradientDataUri(`a-${p.id}`),
            performerFavorite: false,
            performerGender: "FEMALE",
        };
    });
}

function toSummary(p: Perf, idx: number): PerformerSummary {
    return {
        id: p.id,
        name: p.name,
        image_path: gradientDataUri(`a-${p.id}`),
        scene_count: p.count,
        favorite: idx < 3, // Aria/Nova/Sable favourited
    };
}

// ── Collections ──────────────────────────────────────────────────────

const COLLECTION_SUFFIX = " 📁";
const DEMO_COLLECTIONS = [
    { id: "democol-golden", name: "Golden Hours" + COLLECTION_SUFFIX },
    { id: "democol-city", name: "City Nights" + COLLECTION_SUFFIX },
    { id: "democol-studio", name: "Studio Days" + COLLECTION_SUFFIX },
];

/** Deterministic ~40% slice of the library for a collection, keyed by
 *  its tag id — each collection shows a different handful. */
function collectionScenes(colId: string): DemoScene[] {
    const seed = hueForSeed(colId);
    return DEMO_SCENES.filter((_, idx) => (idx * 2 + seed) % 5 < 2);
}

// ── Public builders (called from queries.ts demo branches) ───────────

export function findScenes(v: FindScenesVariables): FindScenesResult {
    // Page > 1 → empty (we return the whole filtered set on page 1, so
    // the reel's append-and-dedupe sees no more pages).
    if ((v.filter?.page ?? 1) > 1) {
        return { findScenes: { count: DEMO_SCENES.length, scenes: [] } };
    }
    let scenes = DEMO_SCENES;
    const sf = v.scene_filter as
        | {
              performers?: { value?: string[] };
              tags?: { value?: string[] };
          }
        | undefined;
    const perfVal = sf?.performers?.value;
    if (perfVal?.length) {
        scenes = scenes.filter((s) =>
            s.performerIds.some((id) => perfVal.includes(id))
        );
    }
    const tagVal = sf?.tags?.value;
    if (tagVal?.length) {
        scenes = scenes.filter((s) =>
            s.tags.some((t) => tagVal.includes(t.id))
        );
    }
    const built = scenes.map(toBingeScene);
    return { findScenes: { count: built.length, scenes: built } };
}

export function findSceneById(id: string): BingeScene | null {
    const d = DEMO_SCENES.find((s) => s.id === id) ?? DEMO_SCENES[0];
    return d ? toBingeScene(d) : null;
}

export function findRecentScenes(): RecentSceneRow[] {
    return DEMO_SCENES.flatMap(toRecentRows);
}

export function findAllPerformers(): PerformerSummary[] {
    return PERFORMERS.map(toSummary);
}

export function findRandomPerformers(count: number): PerformerSummary[] {
    return PERFORMERS.map(toSummary).slice(0, count);
}

export function findPopularTags(): PopularTag[] {
    const names = [
        "Golden Hour", "Outdoor", "Portrait", "Aesthetic",
        "City", "Studio", "Candid", "Solo",
    ];
    return names.map((name, idx) => ({
        id: tagId(name),
        name,
        scene_count: 24 - idx * 2,
    }));
}

export function findPerformer(id: string): PerformerDetail {
    const p = perfById(id) ?? PERFORMERS[0];
    const scs = DEMO_SCENES.filter((s) => s.performerIds.includes(p.id));
    return {
        id: p.id,
        name: p.name,
        alias_list: [],
        favorite: PERFORMERS.indexOf(p) < 3,
        image_path: gradientDataUri(`a-${p.id}`),
        details: "Golden-hour regular. Studio + candid work.",
        country: "US",
        birthdate: null,
        hair_color: null,
        eye_color: null,
        scene_count: p.count,
        gallery_count: 0,
        o_counter: p.count * 3,
        rating100: 84,
        twitter: null,
        instagram: p.name.toLowerCase(),
        url: null,
        urls: [],
        tags: scs[0]?.tags ?? [],
        stash_ids: [],
    };
}

export function findScenesByPerformer(
    performerId: string,
    page: number,
    perPage: number
): { count: number; scenes: PerformerSceneCard[] } {
    const all = DEMO_SCENES.filter((s) =>
        s.performerIds.includes(performerId)
    );
    const start = (page - 1) * perPage;
    return {
        count: all.length,
        scenes: all.slice(start, start + perPage).map(toSceneCard),
    };
}

export function findTagsContaining(
    needle: string
): { id: string; name: string }[] {
    // Saved page asks for the " 📁" collection suffix.
    if (needle.includes("📁")) return DEMO_COLLECTIONS;
    return [];
}

export function findRecentScenesForTag(
    tagId: string,
    limit: number
): CollectionCover {
    const scs = collectionScenes(tagId);
    return {
        count: scs.length,
        scenes: scs.slice(0, limit).map((d) => ({
            id: d.id,
            screenshot: gradientDataUri(`s-${d.id}`),
        })),
    };
}

export function findScenesByTag(
    tagId: string,
    page: number,
    perPage: number
): { count: number; scenes: PerformerSceneCard[] } {
    const all = collectionScenes(tagId);
    const start = (page - 1) * perPage;
    return {
        count: all.length,
        scenes: all.slice(start, start + perPage).map(toSceneCard),
    };
}
