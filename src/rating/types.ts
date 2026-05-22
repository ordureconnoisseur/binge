// Shared types for the ASR/APR-compatible criterion-rating system.
//
// ASR ("Advanced Scene Rating") and APR ("Advanced Performer Rating")
// are two Stash plugins from the same author with identical data
// models: criteria are bucketed into groups, each criterion has a
// 0–5 score recorded as a tag on the entity, and the entity's
// `rating100` is recomputed server-side by the plugin's Python hook
// after any update.
//
// binge re-implements the modal UI natively in React so the rating
// experience stays inline with the reel — but talks to the SAME tag
// scheme and config that ASR/APR own. See CLAUDE.md for the upstream-
// sync contract.

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

export interface RatingConfig {
    pluginId: string;       // "advancedSceneRating" or "advancedPerformerRating"
    groups: Group[];
    criteria: Criterion[];  // already filtered to enabled=true
}

// Suffix used by both ASR and APR for criterion tags. The criterion's
// display name has " ★" appended to form the tag prefix, e.g.
// "Production Quality ★", then score tags are "<prefix>: <0-5>".
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
