import {
    type Criterion,
    type Group,
    type RatingConfig,
    SCORE_TAG_PATTERN,
    criterionTagPrefix,
    scoreTagName,
} from "./types";

// Tag on an entity (scene or performer). We only care about
// id + name for the rating system; the rest of the tag fields don't
// affect criterion-score parsing.
export interface TagMin {
    id: string;
    name: string;
}

// Read current per-criterion scores from an entity's tags. Tags that
// match the score pattern but reference a criterion that's not in the
// active config are ignored (e.g. user disabled a criterion in ASR
// after rating; the score tag survives on the entity but won't show
// in the modal).
export function parseRatingsFromTags(
    tags: ReadonlyArray<TagMin>,
    criteria: ReadonlyArray<Criterion>
): Record<string, number> {
    const byPrefix = new Map<string, Criterion>();
    for (const c of criteria) byPrefix.set(criterionTagPrefix(c), c);

    const out: Record<string, number> = {};
    for (const tag of tags) {
        const m = tag.name.match(SCORE_TAG_PATTERN);
        if (!m) continue;
        const prefix = m[1].trim();
        const score = parseInt(m[2], 10);
        const c = byPrefix.get(prefix);
        if (c) out[c.id] = score;
    }
    return out;
}

// Build the new tag_ids list for an entity-update mutation. Removes
// any tag that matches the score pattern for this specific criterion
// (regardless of score) and appends the new score tag's id if a
// non-null score was given.
//
// Returns null when the score tag id can't be resolved (e.g. ASR's
// score tags haven't been created yet) — caller decides whether to
// surface an error or attempt to create the tag first.
export function buildUpdatedTagIds(
    currentTags: ReadonlyArray<TagMin>,
    criterion: Criterion,
    newScore: number | null,
    newScoreTagId: string | null
): string[] | null {
    const prefix = criterionTagPrefix(criterion);
    const filtered = currentTags.filter((t) => {
        const m = t.name.match(SCORE_TAG_PATTERN);
        if (!m) return true;
        const tagPrefix = m[1].trim();
        return tagPrefix !== prefix;
    });
    const result = filtered.map((t) => t.id);
    if (newScore === null) return result;
    if (!newScoreTagId) return null;
    if (!result.includes(newScoreTagId)) result.push(newScoreTagId);
    return result;
}

// Replicates ASR/APR's weighted formula for the preview shown in the
// modal. Stash's Python hook is the source of truth — this is for UI
// feedback only.
export function computeRating100(
    ratings: Readonly<Record<string, number>>,
    config: RatingConfig,
    precision: number = 20
): number | null {
    const groupContrib: { groupWeight: number; groupAvg: number }[] = [];
    const criteriaByGroup = new Map<string, Criterion[]>();
    for (const c of config.criteria) {
        const arr = criteriaByGroup.get(c.groupId) ?? [];
        arr.push(c);
        criteriaByGroup.set(c.groupId, arr);
    }
    for (const g of config.groups) {
        const inGroup = criteriaByGroup.get(g.id) ?? [];
        let weightedScoreSum = 0;
        let weightSum = 0;
        for (const c of inGroup) {
            const score = ratings[c.id];
            if (typeof score !== "number") continue;
            weightedScoreSum += score * c.weight;
            weightSum += c.weight;
        }
        if (weightSum > 0) {
            groupContrib.push({
                groupWeight: g.weight,
                groupAvg: weightedScoreSum / weightSum,
            });
        }
    }
    if (groupContrib.length === 0) return null;
    let num = 0;
    let den = 0;
    for (const g of groupContrib) {
        num += g.groupAvg * g.groupWeight;
        den += g.groupWeight;
    }
    if (den === 0) return null;
    const final05 = num / den;
    const safePrecision = precision > 0 ? precision : 20;
    let rating100 = Math.round(
        Math.round((final05 * 20) / safePrecision) * safePrecision
    );
    rating100 = Math.max(safePrecision, Math.min(100, rating100));
    return rating100;
}

// Number of criteria visible (enabled) per group — for the modal's
// per-group section header.
export function countCriteriaPerGroup(
    config: RatingConfig
): Map<string, Criterion[]> {
    const out = new Map<string, Criterion[]>();
    for (const c of config.criteria) {
        const arr = out.get(c.groupId) ?? [];
        arr.push(c);
        out.set(c.groupId, arr);
    }
    return out;
}

// Convenience: how many criteria are rated vs total.
export function ratingProgress(
    ratings: Readonly<Record<string, number>>,
    criteria: ReadonlyArray<Criterion>
): { rated: number; total: number } {
    let rated = 0;
    for (const c of criteria) {
        if (typeof ratings[c.id] === "number") rated++;
    }
    return { rated, total: criteria.length };
}

// Re-exports for callers that want to build a tag name without
// importing types.ts directly.
export { criterionTagPrefix, scoreTagName };
export type { Criterion, Group, RatingConfig };
