// Shared types for the Advanced Rating criterion system.
//
// `advancedRating` is a single Stash plugin (the merged successor of
// the old `advancedSceneRating` + `advancedPerformerRating` plugins)
// that handles both scene and performer rating with one data model:
// criteria are bucketed into groups, each criterion has a 0–5 score
// recorded as a tag on the entity, and the entity's `rating100` is
// recomputed server-side by the plugin's Python hook after any update.
//
// Within the merged plugin's config dict, the two domains are
// namespaced by key prefix — `scene_*` and `performer_*`.
//
// binge re-implements the modal UI natively in React so the rating
// experience stays inline with the reel — but talks to the SAME tag
// scheme and config that the plugin owns. See CLAUDE.md for the
// upstream-sync contract.

export interface Group {
    id: string;
    name: string;
    weight: number;
}

export interface Criterion {
    id: string;
    name: string;
    groupId: string;
    weight: number;
    enabled: boolean;
    description: string;
}

export type RatingDomain = "scene" | "performer";

export interface RatingConfig {
    domain: RatingDomain;
    groups: Group[];
    criteria: Criterion[];  // already filtered to enabled=true
}

// Suffix used by the Advanced Rating plugin for criterion tags. The
// criterion's display name has " ★" appended to form the tag prefix,
// e.g. "Production Quality ★", then score tags are "<prefix>: <0-5>".
export const TAG_SUFFIX = " ★";

// Regex matching score tags. Group 1 = prefix (criterion name + ★),
// group 2 = score (0-5). Trimmed to tolerate stray whitespace.
export const SCORE_TAG_PATTERN = /^(.+?)\s*:\s*([0-5])$/;

// Per-criterion tag prefix ("Production Quality ★"). Score tags
// extend this as "Production Quality ★: 4".
export function criterionTagPrefix(c: Criterion): string {
    return c.name + TAG_SUFFIX;
}

export function scoreTagName(c: Criterion, score: number): string {
    return criterionTagPrefix(c) + ": " + score;
}
