// Shared "is this a meta/system tag" predicate. Used to keep ASR
// rating tags ("Body ★: 4"), APR criterion roots ("Body ★"), and
// binge's own collection tags ("Watch Later 📁") out of any
// taste/recommendation surface — they're plumbing, not topics the
// user wants to filter by.
import { COLLECTION_TAG_SUFFIX } from "./collections";
import { SCORE_TAG_PATTERN, TAG_SUFFIX } from "../rating/types";

// Tag names that get hidden from chip suggestions, picker results,
// etc. Returns `true` for system/meta tags.
export function isSystemTag(name: string): boolean {
    if (!name) return false;
    // Collection tags: end in " 📁"
    if (name.endsWith(COLLECTION_TAG_SUFFIX)) return true;
    // ASR/APR score tags: "<criterion> ★: <0-5>"
    if (SCORE_TAG_PATTERN.test(name) && name.includes(TAG_SUFFIX)) return true;
    // ASR/APR criterion root tags: end in " ★"
    if (name.endsWith(TAG_SUFFIX)) return true;
    return false;
}

export function filterOutSystemTags<T extends { name: string }>(
    tags: ReadonlyArray<T>
): T[] {
    return tags.filter((t) => !isSystemTag(t.name));
}
