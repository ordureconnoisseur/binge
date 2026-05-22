import type { Criterion, Group, RatingConfig } from "./types";

// Loads ASR/APR config from Stash's plugin store and parses it into
// the same shape both plugins use internally.
//
// Config schema (lifted from ASR/APR source — same keys for both,
// distinguished only by the plugin_id used to fetch):
//   apr_group_ids        = "<id1>,<id2>,..."
//   apr_group_name_<id>  = "Overall"
//   apr_group_weight_<id> = "1"  (string)
//   apr_criteria_ids     = "<id1>,<id2>,..."
//   apr_name_<id>        = "Production Quality"
//   apr_group_<id>       = "<group_id>"
//   apr_weight_<id>      = "1"  (string)
//   apr_enabled_<id>     = true / false
//   apr_desc_<id>        = "tooltip text"

interface RawPluginConfig {
    [key: string]: unknown;
}

const STASH_GRAPHQL = "/graphql";

interface ConfigQueryResponse {
    data?: {
        configuration?: {
            plugins?: Record<string, RawPluginConfig | null>;
        };
    };
    errors?: { message: string }[];
}

async function fetchPluginConfig(
    pluginId: string
): Promise<RawPluginConfig | null> {
    const resp = await fetch(STASH_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: `query { configuration { plugins } }`,
        }),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as ConfigQueryResponse;
    if (body.errors && body.errors.length > 0) return null;
    return body.data?.configuration?.plugins?.[pluginId] ?? null;
}

function coerceBool(v: unknown, fallback: boolean): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
        const low = v.toLowerCase();
        if (low === "true" || low === "1") return true;
        if (low === "false" || low === "0") return false;
    }
    if (typeof v === "number") return v !== 0;
    return fallback;
}

function coerceFloat(v: unknown, fallback: number): number {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const f = parseFloat(v);
        if (Number.isFinite(f)) return f;
    }
    return fallback;
}

function coerceCsvIds(v: unknown): string[] {
    if (typeof v !== "string") return [];
    return v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

// ASR defaults — flat list under a single "Overall" group.
const ASR_DEFAULT_GROUPS: Group[] = [
    { id: "overall", name: "Overall", weight: 1 },
];
const ASR_DEFAULT_CRITERIA: Criterion[] = [
    { id: "production_quality", name: "Production Quality", groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "chemistry",          name: "Chemistry",          groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "performance",        name: "Performance",        groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "aesthetics",         name: "Aesthetics",         groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "creativity",         name: "Creativity",         groupId: "overall", weight: 1, enabled: true, description: "" },
];

// APR defaults — two groups (physical, performance) split criteria.
const APR_DEFAULT_GROUPS: Group[] = [
    { id: "physical",    name: "Physical",    weight: 1 },
    { id: "performance", name: "Performance", weight: 1 },
];
const APR_DEFAULT_CRITERIA: Criterion[] = [
    { id: "face",        name: "Face",        groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "breasts",     name: "Breasts",     groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "ass",         name: "Ass",         groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "body",        name: "Body",        groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "genitals",    name: "Genitals",    groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "technique",   name: "Technique",   groupId: "performance", weight: 1, enabled: true, description: "" },
    { id: "energy",      name: "Energy",      groupId: "performance", weight: 1, enabled: true, description: "" },
    { id: "sluttiness",  name: "Sluttiness",  groupId: "performance", weight: 1, enabled: true, description: "" },
];

function defaultsFor(pluginId: string): {
    groups: Group[];
    criteria: Criterion[];
} {
    if (pluginId === "advancedPerformerRating") {
        return {
            groups: APR_DEFAULT_GROUPS,
            criteria: APR_DEFAULT_CRITERIA,
        };
    }
    return { groups: ASR_DEFAULT_GROUPS, criteria: ASR_DEFAULT_CRITERIA };
}

// Parse a raw plugin-config map into typed groups+criteria. Falls
// back to plugin-appropriate defaults when fields are missing — same
// behaviour ASR/APR's own UI uses when config is empty.
function parseConfig(
    pluginId: string,
    raw: RawPluginConfig | null
): { groups: Group[]; criteria: Criterion[] } {
    const defaults = defaultsFor(pluginId);
    if (!raw) return defaults;

    const groupIds = coerceCsvIds(raw["apr_group_ids"]);
    const criteriaIds = coerceCsvIds(raw["apr_criteria_ids"]);

    const groups: Group[] =
        groupIds.length === 0
            ? defaults.groups
            : groupIds.map((id) => {
                  const fallbackGroup =
                      defaults.groups.find((g) => g.id === id) ?? {
                          id,
                          name: id,
                          weight: 1,
                      };
                  return {
                      id,
                      name:
                          (raw[`apr_group_name_${id}`] as string | undefined) ??
                          fallbackGroup.name,
                      weight: coerceFloat(
                          raw[`apr_group_weight_${id}`],
                          fallbackGroup.weight
                      ),
                  };
              });

    const groupIdSet = new Set(groups.map((g) => g.id));

    const criteria: Criterion[] =
        criteriaIds.length === 0
            ? defaults.criteria
            : criteriaIds.map((id) => {
                  const fallbackCriterion =
                      defaults.criteria.find((c) => c.id === id) ?? {
                          id,
                          name: id,
                          groupId: groups[0]?.id ?? "",
                          weight: 1,
                          enabled: true,
                          description: "",
                      };
                  const groupId =
                      (raw[`apr_group_${id}`] as string | undefined) ??
                      fallbackCriterion.groupId;
                  // ASR/APR also support legacy `disable_<id>` keys.
                  const legacyDisabled = coerceBool(
                      raw[`disable_${id}`],
                      false
                  );
                  return {
                      id,
                      name:
                          (raw[`apr_name_${id}`] as string | undefined) ??
                          fallbackCriterion.name,
                      groupId: groupIdSet.has(groupId)
                          ? groupId
                          : groups[0]?.id ?? "",
                      weight: coerceFloat(
                          raw[`apr_weight_${id}`],
                          fallbackCriterion.weight
                      ),
                      enabled: legacyDisabled
                          ? false
                          : coerceBool(
                                raw[`apr_enabled_${id}`],
                                fallbackCriterion.enabled
                            ),
                      description:
                          (raw[`apr_desc_${id}`] as string | undefined) ??
                          fallbackCriterion.description,
                  };
              });

    return { groups, criteria };
}

// Module-level promise cache: configs change rarely; one fetch per
// plugin per session is plenty.
const cache = new Map<string, Promise<RatingConfig>>();

export function loadRatingConfig(pluginId: string): Promise<RatingConfig> {
    const existing = cache.get(pluginId);
    if (existing) return existing;
    const p = (async () => {
        const raw = await fetchPluginConfig(pluginId);
        const { groups, criteria } = parseConfig(pluginId, raw);
        return {
            pluginId,
            groups,
            // Drop disabled criteria — replica modal only shows the
            // ones the user has enabled in ASR/APR's settings panel.
            criteria: criteria.filter((c) => c.enabled),
        };
    })();
    cache.set(pluginId, p);
    return p;
}

export function invalidateRatingConfig(pluginId?: string): void {
    if (pluginId) cache.delete(pluginId);
    else cache.clear();
}
