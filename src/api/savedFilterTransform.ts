// Stash stores a SavedFilter's criteria in `object_filter` using its
// UI's internal shape — NOT the same shape Stash's GraphQL findScenes
// scene_filter argument expects. The UI's `Criterion` classes convert
// to the input shape before submitting; binge has to do the same.
//
// Observed format differences from probing the user's real saved
// filters (mode: SCENES):
//
//   1. Int/Float/Date criteria wrap their value an extra level deep:
//        stored: { modifier: LESS_THAN, value: { value: 2 } }
//        input : { modifier: LESS_THAN, value: 2 }
//
//      Range modifiers (BETWEEN / NOT_BETWEEN) keep value2 at the
//      same nested level — we flatten both.
//
//   2. Some SceneFilterType fields are SCALARS at the input layer
//      (not criteria). They're still stored criterion-shaped though:
//        stored: { modifier: EQUALS, value: "stash_id" }
//        input : "stash_id"
//
//      The stored modifier is dropped; only the value is forwarded.
//
//   3. NULL-test modifiers (IS_NULL / NOT_NULL) often have no `value`
//      key at all in storage. StringCriterionInput etc. require
//      `value: String!` though — we substitute "".
//
//   4. String / Multi criteria already have flat values when stored
//      (the extra-wrap is specific to numeric types). Pass through
//      unchanged.
//
// If a saved filter uses a criterion shape we haven't seen yet, the
// pass-through path applies and Stash may return a 400 — which is
// useful signal to extend this transformer.

// SceneFilterType fields whose GraphQL input is a raw scalar, not a
// criterion object. Each is stored criterion-wrapped; we unwrap to
// the inner value.
const SCALAR_FIELDS: ReadonlySet<string> = new Set([
    "is_missing",
    "has_markers",
    "has_chapters",
    "organized",
    "performer_favorite",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        v !== null && typeof v === "object" && !Array.isArray(v)
    );
}

// Transform a single criterion `{modifier, value}` entry from stored
// shape to input shape.
function transformCriterion(v: Record<string, unknown>): Record<string, unknown> {
    const modifier = v.modifier;
    const value = v.value;

    // No value at all (NOT_NULL / IS_NULL stored without a value key).
    // String/Date inputs still require value: String!, so substitute "".
    if (!("value" in v) || value === undefined || value === null) {
        return { modifier, value: "" };
    }

    // Numeric range wrap: value is itself { value, value2? }.
    if (
        isPlainObject(value) &&
        "value" in value &&
        // Heuristic: storage has at most {value, value2}; anything
        // larger is a different shape and we leave it alone.
        Object.keys(value).length <= 2
    ) {
        const inner = value;
        const out: Record<string, unknown> = {
            modifier,
            value: inner.value,
        };
        if ("value2" in inner && inner.value2 !== undefined && inner.value2 !== null) {
            out.value2 = inner.value2;
        }
        return out;
    }

    // Already-flat shape (strings, arrays of ids, etc.). Pass through.
    return v;
}

export function transformObjectFilter(
    obj: Record<string, unknown> | null | undefined
): Record<string, unknown> {
    if (!obj || !isPlainObject(obj)) return {};
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
        if (val === null || val === undefined) continue;

        // Scalar fields: unwrap to just the inner value, drop modifier.
        if (SCALAR_FIELDS.has(key)) {
            if (isPlainObject(val) && "value" in val) {
                out[key] = (val as Record<string, unknown>).value;
            } else {
                out[key] = val;
            }
            continue;
        }

        if (!isPlainObject(val)) {
            out[key] = val;
            continue;
        }

        // Criterion shape: has modifier (value optional for NOT_NULL etc.).
        if ("modifier" in val) {
            out[key] = transformCriterion(val);
            continue;
        }

        // Unknown shape — pass through (worst case, Stash returns
        // a clearer error and we extend the transformer).
        out[key] = val;
    }

    return out;
}
