import { gql } from "../api/graphql";
import { loadRatingConfig } from "../rating/config";
import type { Criterion } from "../rating/types";
import { TAG_SUFFIX } from "../rating/types";
import {
    DEFAULT_MODEL,
    DEFAULT_OLLAMA_URL,
    DEFAULT_VOICES,
    VOICE_MODES,
    type VoiceMode,
} from "./prompts";

const SCRIBE_PLUGIN_ID = "stashScribe";

export const REVIEW_FIELD_KEY = "stashScribe_review";
const REVIEW_MARKER_START = "<!--stash-scribe:review:start-->";
const REVIEW_MARKER_END = "<!--stash-scribe:review:end-->";

// Same regex as stash-scribe's RATING_CATEGORY_RE — captures the
// criterion display name (sans " ★") plus the 0-5 score. Different
// from binge's rating/types.ts SCORE_TAG_PATTERN which keeps the ★
// in the name; we strip here so we can match against criterion.name
// case-insensitively without normalisation.
const RATING_TAG_RE = /^(.+?)\s*★\s*:\s*([0-5])$/;

export interface LLMMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ScribeConfig {
    ollamaUrl: string;
    model: string;
    voicePrompts: Record<VoiceMode, string>;
    defaultTone: VoiceMode;
    autoCreateTags: boolean;
}

interface SceneTag {
    id: string;
    name: string;
}

export interface SceneForScribe {
    id: string;
    title: string | null;
    date: string | null;
    details: string | null;
    rating100: number | null;
    custom_fields: Record<string, unknown> | null;
    o_counter: number | null;
    play_count: number | null;
    studio: { name: string } | null;
    performers: ScenePerformer[];
    tags: SceneTag[];
}

interface ScenePerformer {
    name: string;
    gender: string | null;
    birthdate: string | null;
    ethnicity: string | null;
    hair_color: string | null;
    eye_color: string | null;
    height_cm: number | null;
    measurements: string | null;
    fake_tits: string | null;
    tattoos: string | null;
    piercings: string | null;
}

// Performer subject for Scribe. Heavier than scene because it
// aggregates the whole library — Stash doesn't expose o_counter /
// scene_count directly on performers, so we sum them in the client.
export interface PerformerForScribe {
    id: string;
    name: string;
    details: string | null;
    rating100: number | null;
    custom_fields: Record<string, unknown> | null;
    birthdate: string | null;
    death_date: string | null;
    country: string | null;
    ethnicity: string | null;
    hair_color: string | null;
    eye_color: string | null;
    height_cm: number | null;
    weight: number | null;
    measurements: string | null;
    fake_tits: string | null;
    gender: string | null;
    favorite: boolean;
    career_length: string | null;
    tattoos: string | null;
    piercings: string | null;
    alias_list: string[];
    tags: SceneTag[];
}

interface PerformerSceneSummary {
    id: string;
    title: string | null;
    rating100: number | null;
    o_counter: number | null;
    play_count: number | null;
    date: string | null;
    details: string | null;
    custom_fields: Record<string, unknown> | null;
    studio: { name: string } | null;
    tags: { name: string }[];
}

export interface PerformerAggregates {
    sceneCount: number;
    totalOCounter: number;
    ratedCount: number;
    avgRating: number | null;
    topTags: string[];
    topStudios: string[];
    notableScenes: PerformerSceneSummary[];
}

// ── Config + criteria ───────────────────────────────────────────────

interface PluginConfigResp {
    configuration: { plugins: Record<string, Record<string, unknown>> };
}

export async function getScribeConfig(): Promise<ScribeConfig> {
    const data = await gql<PluginConfigResp>(`query { configuration { plugins } }`);
    const cfg = data.configuration?.plugins?.[SCRIBE_PLUGIN_ID] ?? {};
    let tone = String(cfg.defaultTone ?? "filthy").toLowerCase() as VoiceMode;
    if ((tone as string) === "vulgar") tone = "filthy";
    else if ((tone as string) === "elegant") tone = "sensual";
    if (!VOICE_MODES.includes(tone)) tone = "filthy";
    const voicePrompts: Record<VoiceMode, string> = {
        direct: (cfg.voicePrompt_direct as string) || DEFAULT_VOICES.direct,
        sensual: (cfg.voicePrompt_sensual as string) || DEFAULT_VOICES.sensual,
        filthy:
            (cfg.voicePrompt_filthy as string) ||
            (cfg.interviewSystem as string) ||
            DEFAULT_VOICES.filthy,
    };
    return {
        ollamaUrl: String(cfg.ollamaUrl ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, ""),
        model: String(cfg.model ?? DEFAULT_MODEL),
        voicePrompts,
        defaultTone: tone,
        autoCreateTags: cfg.autoCreateTags !== false,
    };
}

export async function loadSceneCriteria(): Promise<Criterion[]> {
    const config = await loadRatingConfig("scene");
    return config.criteria;
}

export async function loadPerformerCriteria(): Promise<Criterion[]> {
    const config = await loadRatingConfig("performer");
    return config.criteria;
}

// ── Scene context ───────────────────────────────────────────────────

const FIND_SCENE_FOR_SCRIBE = /* GraphQL */ `
    query SceneForScribe($id: ID!) {
        findScene(id: $id) {
            id
            title
            date
            details
            rating100
            custom_fields
            o_counter
            play_count
            studio {
                name
            }
            performers {
                name
                gender
                birthdate
                ethnicity
                hair_color
                eye_color
                height_cm
                measurements
                fake_tits
                tattoos
                piercings
            }
            tags {
                id
                name
            }
        }
    }
`;

export async function fetchSceneForScribe(
    sceneId: string
): Promise<SceneForScribe | null> {
    const data = await gql<{ findScene: SceneForScribe | null }>(
        FIND_SCENE_FOR_SCRIBE,
        { id: sceneId }
    );
    return data.findScene;
}

// ── Review extraction / formatting ──────────────────────────────────

export function extractReviewFromDetails(details: string | null): string | null {
    if (!details) return null;
    const s = details.indexOf(REVIEW_MARKER_START);
    if (s === -1) return null;
    const e = details.indexOf(REVIEW_MARKER_END, s);
    if (e === -1) return null;
    return details.slice(s + REVIEW_MARKER_START.length, e).trim();
}

export function stripReviewBlock(details: string | null): string {
    if (!details) return "";
    const s = details.indexOf(REVIEW_MARKER_START);
    if (s === -1) return details;
    const e = details.indexOf(REVIEW_MARKER_END, s);
    if (e === -1) return details;
    const before = details.slice(0, s).replace(/\s+$/, "");
    const after = details.slice(e + REVIEW_MARKER_END.length).replace(/^\s+/, "");
    if (!before && !after) return "";
    if (!before) return after;
    if (!after) return before;
    return `${before}\n\n${after}`;
}

export function readExistingReview(scene: SceneForScribe): string | null {
    const cf = scene.custom_fields ?? {};
    const fromCf = cf[REVIEW_FIELD_KEY];
    if (fromCf) return String(fromCf).trim();
    return extractReviewFromDetails(scene.details);
}

// LLM context block. Mirrors stash-scribe's describeSceneForLLM —
// performer demographics + user stats + tags + cleaned synopsis.
export function describeSceneForLLM(scene: SceneForScribe): string {
    const lines: string[] = [];
    if (scene.title) lines.push(`Title: ${scene.title}`);
    if (scene.studio?.name) lines.push(`Studio: ${scene.studio.name}`);
    if (scene.date) lines.push(`Date: ${scene.date}`);

    const perfs = (scene.performers ?? []).slice(0, 10);
    if (perfs.length) {
        const perfLines = perfs
            .map((p) => describePerformerInScene(p, scene.date))
            .filter(Boolean);
        lines.push(perfs.length > 1 ? "Performers:" : "Performer:");
        perfLines.forEach((l) => lines.push("- " + l));
    }

    const userStats: string[] = [];
    if (scene.o_counter) userStats.push(`o-counter ${scene.o_counter}`);
    if (scene.play_count) userStats.push(`played ${scene.play_count}×`);
    if (scene.rating100 != null)
        userStats.push(`already rated ${scene.rating100}/100`);
    if (userStats.length)
        lines.push(`Your history with this scene: ${userStats.join(", ")}`);

    const tags = (scene.tags ?? [])
        .map((t) => t.name)
        .filter((n) => n && !RATING_TAG_RE.test(n));
    if (tags.length) lines.push(`Tags: ${tags.slice(0, 25).join(", ")}`);

    const cleanDetails = stripReviewBlock(scene.details).trim();
    if (cleanDetails) lines.push(`Scene synopsis / existing notes: ${cleanDetails}`);
    return lines.join("\n");
}

function describePerformerInScene(
    p: ScenePerformer,
    sceneDate: string | null
): string {
    if (!p?.name) return "";
    const bits = [p.name];
    const tail: string[] = [];
    const age = ageAtDate(p.birthdate, sceneDate);
    if (age != null) tail.push(`age ${age} here`);
    if (p.ethnicity) tail.push(p.ethnicity.toLowerCase());
    if (p.hair_color) tail.push(p.hair_color.toLowerCase() + " hair");
    if (p.height_cm) tail.push(`${p.height_cm}cm`);
    if (p.measurements) tail.push(p.measurements);
    if (p.fake_tits)
        tail.push(
            p.fake_tits.toLowerCase() === "yes" ? "fake tits" : "natural tits"
        );
    if (p.tattoos) tail.push("tattooed");
    if (p.piercings) tail.push("pierced");
    if (tail.length) bits.push("(" + tail.join(", ") + ")");
    return bits.join(" ");
}

function ageAtDate(
    birthdate: string | null,
    atDate: string | null
): number | null {
    if (!birthdate || !atDate) return null;
    const bd = new Date(birthdate);
    const at = new Date(atDate);
    if (isNaN(bd.getTime()) || isNaN(at.getTime())) return null;
    let age = at.getFullYear() - bd.getFullYear();
    const m = at.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < bd.getDate())) age--;
    return age >= 0 && age < 120 ? age : null;
}

export function buildSceneContextStrip(scene: SceneForScribe): string {
    const bits: string[] = [];
    if (scene.studio?.name) bits.push(scene.studio.name);
    const names = (scene.performers ?? []).map((p) => p.name).filter(Boolean);
    if (names.length) bits.push(names.join(" · "));
    const tagCount = (scene.tags ?? []).filter(
        (t) => !RATING_TAG_RE.test(t.name)
    ).length;
    if (tagCount) bits.push(`${tagCount} tags`);
    return bits.join(" — ");
}

// Pre-fill sliders from existing tags.
export function extractScoresFromTags(
    scene: SceneForScribe,
    criteria: Criterion[]
): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const t of scene.tags ?? []) {
        const m = (t.name || "").match(RATING_TAG_RE);
        if (!m) continue;
        const criterionName = m[1].trim();
        const score = parseInt(m[2], 10);
        const c = criteria.find(
            (cc) => cc.name.toLowerCase() === criterionName.toLowerCase()
        );
        if (c) scores[c.id] = score;
    }
    return scores;
}

// ── LLM bridge (runPluginOperation → stashScribe.py → Ollama) ───────

const RUN_PLUGIN_OP = /* GraphQL */ `
    mutation RunScribeOp($plugin_id: ID!, $args: Map!) {
        runPluginOperation(plugin_id: $plugin_id, args: $args)
    }
`;

interface RunOpResp {
    runPluginOperation: { content?: string; models?: string[]; error?: string } | null;
}

export async function callLLM(
    messages: LLMMessage[],
    cfg: Pick<ScribeConfig, "ollamaUrl" | "model">
): Promise<string> {
    const data = await gql<RunOpResp>(RUN_PLUGIN_OP, {
        plugin_id: SCRIBE_PLUGIN_ID,
        args: {
            op: "chat",
            ollamaUrl: cfg.ollamaUrl,
            model: cfg.model,
            messages,
            temperature: 0.85,
        },
    });
    const out = data.runPluginOperation;
    if (!out) throw new Error("Scribe plugin op returned null");
    if (out.error) throw new Error(out.error);
    if (!out.content) throw new Error("Ollama returned no content");
    return out.content;
}

export async function listModels(
    cfg: Pick<ScribeConfig, "ollamaUrl">
): Promise<string[]> {
    const data = await gql<RunOpResp>(RUN_PLUGIN_OP, {
        plugin_id: SCRIBE_PLUGIN_ID,
        args: { op: "list_models", ollamaUrl: cfg.ollamaUrl },
    });
    return data.runPluginOperation?.models ?? [];
}

// ── Output parsing ──────────────────────────────────────────────────

export interface ParsedReview {
    review: string;
    scores: Record<string, number>;
}

export function parseGenerated(
    body: string,
    criteria: Criterion[]
): ParsedReview {
    const reviewMatch = body.match(/REVIEW:\s*([\s\S]*?)(?=\n\s*SCORES\s*:|$)/i);
    const review = reviewMatch ? reviewMatch[1].trim() : body.trim();
    const scores: Record<string, number> = {};
    const scoresBlock = body.split(/SCORES\s*:/i)[1] ?? "";
    const lineRe = /^[\s•\-*]*(.+?)\s*[:|—-]\s*(\d+(?:\.\d+)?)\s*$/gim;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(scoresBlock)) !== null) {
        const rawName = m[1].trim();
        const rawScore = Math.max(0, Math.min(5, Math.round(parseFloat(m[2]))));
        const c = criteria.find(
            (cc) => cc.name.toLowerCase() === rawName.toLowerCase()
        );
        if (c) scores[c.id] = rawScore;
    }
    return { review, scores };
}

// ── Save (sceneUpdate with details + custom_fields + tag_ids) ───────

async function getTagIdByName(name: string): Promise<string | null> {
    const data = await gql<{
        findTags: { tags: { id: string; name: string }[] };
    }>(
        /* GraphQL */ `
            query FindTagForScribe($tag_filter: TagFilterType) {
                findTags(tag_filter: $tag_filter) {
                    tags {
                        id
                        name
                    }
                }
            }
        `,
        { tag_filter: { name: { value: name, modifier: "EQUALS" } } }
    );
    return data.findTags.tags[0]?.id ?? null;
}

async function findOrCreateTag(name: string): Promise<string> {
    const existing = await getTagIdByName(name);
    if (existing) return existing;
    const data = await gql<{ tagCreate: { id: string } }>(
        /* GraphQL */ `
            mutation TagCreateForScribe($input: TagCreateInput!) {
                tagCreate(input: $input) {
                    id
                }
            }
        `,
        { input: { name, ignore_auto_tag: true } }
    );
    if (!data.tagCreate?.id) throw new Error(`Failed to create tag: ${name}`);
    return data.tagCreate.id;
}

async function buildUpdatedTagIds(
    scene: SceneForScribe,
    criteria: Criterion[],
    scoresByCriterion: Record<string, number>,
    autoCreate: boolean
): Promise<string[]> {
    const existingTags = scene.tags ?? [];
    const keep = existingTags.filter((t) => {
        const m = (t.name || "").match(RATING_TAG_RE);
        if (!m) return true;
        const criterionName = m[1].trim();
        return !criteria.some((c) => c.name === criterionName);
    });
    const newTagIds = keep.map((t) => t.id);
    for (const c of criteria) {
        const score = scoresByCriterion[c.id];
        if (score == null) continue;
        const tagName = `${c.name}${TAG_SUFFIX}: ${score}`;
        let tagId = await getTagIdByName(tagName);
        if (!tagId) {
            if (!autoCreate) {
                throw new Error(
                    `Tag "${tagName}" does not exist. Open the Advanced Rating plugin's settings panel once so it creates the level tags, or enable "Auto-create missing criterion tags" in Stash Scribe settings.`
                );
            }
            tagId = await findOrCreateTag(tagName);
        }
        if (!newTagIds.includes(tagId)) newTagIds.push(tagId);
    }
    return newTagIds;
}

interface SceneUpdateInput {
    id: string;
    details?: string;
    custom_fields?: { partial: Record<string, string> };
    tag_ids?: string[];
}

export async function saveSceneReview(args: {
    scene: SceneForScribe;
    reviewText: string;
    criteria: Criterion[];
    scoresByCriterion: Record<string, number>;
    autoCreate: boolean;
}): Promise<void> {
    const { scene, reviewText, criteria, scoresByCriterion, autoCreate } = args;
    const input: SceneUpdateInput = { id: scene.id };
    input.custom_fields = { partial: { [REVIEW_FIELD_KEY]: reviewText } };
    const cleaned = stripReviewBlock(scene.details);
    if (cleaned !== (scene.details ?? "")) input.details = cleaned;
    if (Object.keys(scoresByCriterion).length > 0) {
        input.tag_ids = await buildUpdatedTagIds(
            scene,
            criteria,
            scoresByCriterion,
            autoCreate
        );
    }
    await gql(
        /* GraphQL */ `
            mutation SceneUpdateScribe($input: SceneUpdateInput!) {
                sceneUpdate(input: $input) {
                    id
                }
            }
        `,
        { input }
    );
}

// ── Performer context ───────────────────────────────────────────────

const FIND_PERFORMER_FOR_SCRIBE = /* GraphQL */ `
    query PerformerForScribe($id: ID!) {
        findPerformer(id: $id) {
            id
            name
            details
            rating100
            custom_fields
            birthdate
            death_date
            country
            ethnicity
            hair_color
            eye_color
            height_cm
            weight
            measurements
            fake_tits
            gender
            favorite
            career_length
            tattoos
            piercings
            alias_list
            tags {
                id
                name
            }
        }
    }
`;

const FIND_SCENES_FOR_PERFORMER_AGG = /* GraphQL */ `
    query ScenesForPerformerAgg($id: ID!) {
        findScenes(
            scene_filter: { performers: { value: [$id], modifier: INCLUDES } }
            filter: { per_page: -1 }
        ) {
            count
            scenes {
                id
                title
                rating100
                o_counter
                play_count
                date
                details
                custom_fields
                studio {
                    name
                }
                tags {
                    name
                }
            }
        }
    }
`;

// Pulls the performer profile + every scene they appear in. Heavy
// fetch (per_page: -1), but only fires when the user opens Scribe
// on a performer; cached by browser GraphQL semantics for the
// session, and we don't refetch unless the modal is reopened.
export async function fetchPerformerForScribe(
    performerId: string
): Promise<{
    performer: PerformerForScribe;
    aggregates: PerformerAggregates;
} | null> {
    const [profileResp, scenesResp] = await Promise.all([
        gql<{ findPerformer: PerformerForScribe | null }>(
            FIND_PERFORMER_FOR_SCRIBE,
            { id: performerId }
        ),
        gql<{
            findScenes: {
                count: number;
                scenes: PerformerSceneSummary[];
            };
        }>(FIND_SCENES_FOR_PERFORMER_AGG, { id: performerId }),
    ]);
    const performer = profileResp.findPerformer;
    if (!performer) return null;
    return {
        performer,
        aggregates: aggregatePerformerScenes(scenesResp.findScenes),
    };
}

function aggregatePerformerScenes(list: {
    count: number;
    scenes: PerformerSceneSummary[];
}): PerformerAggregates {
    const scenes = list.scenes ?? [];
    const sceneCount = list.count ?? scenes.length;
    const totalOCounter = scenes.reduce(
        (sum, s) => sum + (s.o_counter ?? 0),
        0
    );
    const rated = scenes.filter((s) => s.rating100 != null);
    const avgRating = rated.length
        ? Math.round(
              rated.reduce((a, s) => a + (s.rating100 ?? 0), 0) / rated.length
          )
        : null;

    const tagFreq: Record<string, number> = {};
    for (const s of scenes) {
        for (const t of s.tags ?? []) {
            if (t.name && !RATING_TAG_RE.test(t.name)) {
                tagFreq[t.name] = (tagFreq[t.name] ?? 0) + 1;
            }
        }
    }
    const topTags = Object.keys(tagFreq)
        .sort((a, b) => tagFreq[b] - tagFreq[a])
        .slice(0, 10);

    const studioFreq: Record<string, number> = {};
    for (const s of scenes) {
        const sn = s.studio?.name;
        if (sn) studioFreq[sn] = (studioFreq[sn] ?? 0) + 1;
    }
    const topStudios = Object.keys(studioFreq)
        .sort((a, b) => studioFreq[b] - studioFreq[a])
        .slice(0, 5);

    // Notable scenes: union of top-3 by rating, o, plays (deduped, cap 8).
    // Same selection rule as stash-scribe — what the LLM uses to ground the
    // performer review in specifics.
    function topN(
        arr: PerformerSceneSummary[],
        key: "rating100" | "o_counter" | "play_count",
        n: number
    ): PerformerSceneSummary[] {
        return arr
            .filter((s) => (s[key] ?? 0) > 0)
            .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
            .slice(0, n);
    }
    const seen = new Set<string>();
    const notable: PerformerSceneSummary[] = [];
    for (const s of [
        ...topN(scenes, "rating100", 3),
        ...topN(scenes, "o_counter", 3),
        ...topN(scenes, "play_count", 3),
    ]) {
        if (!seen.has(s.id)) {
            seen.add(s.id);
            notable.push(s);
        }
    }

    return {
        sceneCount,
        totalOCounter,
        ratedCount: rated.length,
        avgRating,
        topTags,
        topStudios,
        notableScenes: notable.slice(0, 8),
    };
}

function ageFromBirthdate(birthdate: string | null): number | null {
    if (!birthdate) return null;
    const bd = new Date(birthdate);
    if (isNaN(bd.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - bd.getFullYear();
    const m = now.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
    return age >= 0 && age < 120 ? age : null;
}

function truncate(s: string, max: number): string {
    if (!s) return "";
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function summarizeNotableScene(s: PerformerSceneSummary): string {
    const lines: string[] = [];
    const header: string[] = [];
    if (s.title) header.push(`"${s.title}"`);
    if (s.studio?.name) header.push(s.studio.name);
    if (s.date) header.push(s.date);
    lines.push("• " + header.join(" — "));
    const stats: string[] = [];
    if (s.rating100 != null) stats.push(`rating ${s.rating100}/100`);
    if (s.o_counter) stats.push(`${s.o_counter} O`);
    if (s.play_count) stats.push(`${s.play_count} plays`);
    if (stats.length) lines.push("  " + stats.join(", "));
    const tags = (s.tags ?? [])
        .map((t) => t.name)
        .filter((n) => n && !RATING_TAG_RE.test(n))
        .slice(0, 8);
    if (tags.length) lines.push("  tags: " + tags.join(", "));
    const cf = s.custom_fields ?? {};
    const scribeReview: string | null = cf[REVIEW_FIELD_KEY]
        ? String(cf[REVIEW_FIELD_KEY]).trim()
        : null;
    const detailsClean = stripReviewBlock(s.details ?? "").trim();
    const fromDetailsReview = extractReviewFromDetails(s.details);
    const reviewText: string | null = scribeReview || fromDetailsReview;
    if (reviewText) {
        lines.push("  your review: " + truncate(reviewText, 400));
    } else if (detailsClean) {
        lines.push("  synopsis: " + truncate(detailsClean, 300));
    }
    return lines.join("\n");
}

export function describePerformerForLLM(
    performer: PerformerForScribe,
    aggregates: PerformerAggregates
): string {
    const lines: string[] = [];
    lines.push(`Name: ${performer.name}`);
    const aliases = (performer.alias_list ?? []).filter(
        (a) => a && a !== performer.name
    );
    if (aliases.length) lines.push(`Aliases: ${aliases.join(", ")}`);
    const demo: string[] = [];
    if (performer.gender) demo.push(performer.gender.toLowerCase());
    const age = ageFromBirthdate(performer.birthdate);
    if (age != null) demo.push(performer.death_date ? `was age ${age}` : `age ${age}`);
    if (performer.ethnicity) demo.push(performer.ethnicity);
    if (performer.country) demo.push(performer.country);
    if (demo.length) lines.push(`Demographics: ${demo.join(", ")}`);
    const phys: string[] = [];
    if (performer.hair_color) phys.push(`hair ${performer.hair_color}`);
    if (performer.eye_color) phys.push(`eyes ${performer.eye_color}`);
    if (performer.height_cm) phys.push(`${performer.height_cm}cm`);
    if (performer.weight) phys.push(`${performer.weight}kg`);
    if (performer.measurements) phys.push(performer.measurements);
    if (performer.fake_tits)
        phys.push(
            performer.fake_tits.toLowerCase() === "yes"
                ? "fake tits"
                : "natural tits"
        );
    if (phys.length) lines.push(`Physical: ${phys.join(", ")}`);
    if (performer.tattoos) lines.push(`Tattoos: ${performer.tattoos}`);
    if (performer.piercings) lines.push(`Piercings: ${performer.piercings}`);
    if (performer.career_length) lines.push(`Career: ${performer.career_length}`);

    const a = aggregates;
    const stats: string[] = [`${a.sceneCount} scenes in library`];
    if (a.totalOCounter > 0) {
        stats.push(
            `Stash o-counter total ${a.totalOCounter} (sum across her scenes — a single scene can contribute multiple)`
        );
    }
    if (a.avgRating != null)
        stats.push(
            `average rating ${a.avgRating}/100 across ${a.ratedCount} scenes you have rated`
        );
    lines.push(`Library stats: ${stats.join("; ")}`);
    if (a.topStudios.length)
        lines.push(`Top studios: ${a.topStudios.join(", ")}`);
    if (a.topTags.length) lines.push(`Signature tags: ${a.topTags.join(", ")}`);
    if (a.notableScenes.length) {
        lines.push("");
        lines.push(
            "Notable scenes (top by rating / o-count / play-count — reference these specifically in the review):"
        );
        for (const s of a.notableScenes) lines.push(summarizeNotableScene(s));
    }

    const cleanDetails = stripReviewBlock(performer.details).trim();
    if (cleanDetails) lines.push(`Bio / existing notes: ${cleanDetails}`);
    return lines.join("\n");
}

export function buildPerformerContextStrip(
    performer: PerformerForScribe,
    a: PerformerAggregates
): string {
    const bits: string[] = [performer.name];
    if (a.sceneCount) bits.push(`${a.sceneCount} scenes`);
    if (a.totalOCounter) bits.push(`${a.totalOCounter} 💧`);
    if (a.topStudios.length) bits.push(a.topStudios.slice(0, 2).join(" · "));
    return bits.join(" — ");
}

// extractScoresFromTags works for any subject with .tags — alias here
// so the modal can call a kind-neutral function. (The original is
// SceneForScribe-typed; rather than widen its signature we wrap.)
export function extractScoresFromTagsGeneric(
    subject: { tags: SceneTag[] },
    criteria: Criterion[]
): Record<string, number> {
    return extractScoresFromTags(subject as SceneForScribe, criteria);
}

// readExistingReview works for any subject with .custom_fields +
// .details — alias for the performer path.
export function readExistingReviewGeneric(subject: {
    custom_fields: Record<string, unknown> | null;
    details: string | null;
}): string | null {
    const cf = subject.custom_fields ?? {};
    const fromCf = cf[REVIEW_FIELD_KEY];
    if (fromCf) return String(fromCf).trim();
    return extractReviewFromDetails(subject.details);
}

interface PerformerUpdateInput {
    id: string;
    details?: string;
    custom_fields?: { partial: Record<string, string> };
    tag_ids?: string[];
}

// Save the review back to the performer. Tries custom_fields first
// (preferred — keeps the bio clean); on older Stash builds where
// PerformerUpdateInput.custom_fields is rejected, falls back to a
// sentinel block in details. Same dual-strategy stash-scribe uses.
export async function savePerformerReview(args: {
    performer: PerformerForScribe;
    reviewText: string;
    criteria: Criterion[];
    scoresByCriterion: Record<string, number>;
    autoCreate: boolean;
}): Promise<void> {
    const { performer, reviewText, criteria, scoresByCriterion, autoCreate } =
        args;
    const baseInput: PerformerUpdateInput = { id: performer.id };
    if (Object.keys(scoresByCriterion).length > 0) {
        baseInput.tag_ids = await buildUpdatedTagIdsForSubject(
            performer,
            criteria,
            scoresByCriterion,
            autoCreate
        );
    }
    const cleanedDetails = stripReviewBlock(performer.details);
    const detailsPatch =
        cleanedDetails !== (performer.details ?? "")
            ? { details: cleanedDetails }
            : {};
    try {
        await gql(
            /* GraphQL */ `
                mutation PerformerUpdateScribe(
                    $input: PerformerUpdateInput!
                ) {
                    performerUpdate(input: $input) {
                        id
                    }
                }
            `,
            {
                input: {
                    ...baseInput,
                    custom_fields: {
                        partial: { [REVIEW_FIELD_KEY]: reviewText },
                    },
                    ...detailsPatch,
                },
            }
        );
    } catch (e) {
        const msg = (e as Error).message ?? "";
        if (!/custom_fields/i.test(msg)) throw e;
        // Older Stash: fall back to details-sentinel block.
        console.warn(
            "[binge-scribe] PerformerUpdateInput.custom_fields rejected — falling back to details sentinel block",
            e
        );
        await gql(
            /* GraphQL */ `
                mutation PerformerUpdateScribe(
                    $input: PerformerUpdateInput!
                ) {
                    performerUpdate(input: $input) {
                        id
                    }
                }
            `,
            {
                input: {
                    ...baseInput,
                    details: appendReviewBlock(cleanedDetails, reviewText),
                },
            }
        );
    }
}

// Generic "replace this subject's score tags" — same body as
// buildUpdatedTagIds but typed against a subject-with-tags so the
// performer path can reuse it. The subject only needs `.tags`.
async function buildUpdatedTagIdsForSubject(
    subject: { tags: SceneTag[] },
    criteria: Criterion[],
    scoresByCriterion: Record<string, number>,
    autoCreate: boolean
): Promise<string[]> {
    return buildUpdatedTagIds(
        subject as SceneForScribe,
        criteria,
        scoresByCriterion,
        autoCreate
    );
}

function appendReviewBlock(
    details: string,
    reviewText: string
): string {
    const stripped = stripReviewBlock(details);
    const review = (reviewText || "").trim();
    if (!review) return stripped;
    const block = `<!--stash-scribe:review:start-->\n${review}\n<!--stash-scribe:review:end-->`;
    return stripped ? `${stripped}\n\n${block}` : block;
}
