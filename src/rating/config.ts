import type {
    Criterion,
    Group,
    RatingConfig,
    RatingDomain,
} from "./types";

// Loads the Advanced Rating plugin's config from Stash and parses
// it into typed groups + criteria for one domain (scene or performer).
//
// The merged plugin stores both domains' config under a single plugin
// ID (`advancedRating`) and namespaces keys by domain prefix:
//   scene_group_ids        = "<id1>,<id2>,..."
//   scene_group_name_<id>  = "Overall"
//   scene_group_weight_<id> = "1"
//   scene_criteria_ids     = "<id1>,<id2>,..."
//   scene_name_<id>        = "Production Quality"
//   scene_group_<id>       = "<group_id>"
//   scene_weight_<id>      = "1"
//   scene_enabled_<id>     = true / false
//   scene_desc_<id>        = "tooltip text"
//   performer_*            = same shape, performer domain
//
// We strip the domain prefix from each key on read and then parse the
// un-prefixed shape, so the per-criterion / per-group reads below are
// the same regardless of domain.

const PLUGIN_ID = "advancedRating";

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

async function fetchPluginConfig(): Promise<RawPluginConfig | null> {
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
    return body.data?.configuration?.plugins?.[PLUGIN_ID] ?? null;
}

// Take the merged plugin's full config and return a view containing
// only the requested domain's keys, with the `<domain>_` prefix stripped.
function viewForDomain(
    raw: RawPluginConfig | null,
    domain: RatingDomain
): RawPluginConfig {
    if (!raw) return {};
    const prefix = domain + "_";
    const out: RawPluginConfig = {};
    for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith(prefix)) {
            out[k.slice(prefix.length)] = v;
        }
    }
    return out;
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

// Scene defaults — flat list under a single "Overall" group.
const SCENE_DEFAULT_GROUPS: Group[] = [
    { id: "overall", name: "Overall", weight: 1 },
];
const SCENE_DEFAULT_CRITERIA: Criterion[] = [
    { id: "production_quality", name: "Production Quality", groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "chemistry",          name: "Chemistry",          groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "performance",        name: "Performance",        groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "aesthetics",         name: "Aesthetics",         groupId: "overall", weight: 1, enabled: true, description: "" },
    { id: "creativity",         name: "Creativity",         groupId: "overall", weight: 1, enabled: true, description: "" },
];

// Performer defaults — two groups (physical, performance) split criteria.
const PERFORMER_DEFAULT_GROUPS: Group[] = [
    { id: "physical",    name: "Physical",    weight: 1 },
    { id: "performance", name: "Performance", weight: 1 },
];
const PERFORMER_DEFAULT_CRITERIA: Criterion[] = [
    { id: "face",        name: "Face",        groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "breasts",     name: "Breasts",     groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "ass",         name: "Ass",         groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "body",        name: "Body",        groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "genitals",    name: "Genitals",    groupId: "physical",    weight: 1, enabled: true, description: "" },
    { id: "technique",   name: "Technique",   groupId: "performance", weight: 1, enabled: true, description: "" },
    { id: "energy",      name: "Energy",      groupId: "performance", weight: 1, enabled: true, description: "" },
    { id: "sluttiness",  name: "Sluttiness",  groupId: "performance", weight: 1, enabled: true, description: "" },
];

function defaultsFor(domain: RatingDomain): {
    groups: Group[];
    criteria: Criterion[];
} {
    if (domain === "performer") {
        return {
            groups: PERFORMER_DEFAULT_GROUPS,
            criteria: PERFORMER_DEFAULT_CRITERIA,
        };
    }
    return { groups: SCENE_DEFAULT_GROUPS, criteria: SCENE_DEFAULT_CRITERIA };
}

// Parse a domain-prefix-stripped config view into typed groups+criteria.
// Falls back to domain-appropriate defaults when fields are missing —
// same behaviour the plugin's own UI uses when config is empty.
function parseConfig(
    domain: RatingDomain,
    view: RawPluginConfig
): { groups: Group[]; criteria: Criterion[] } {
    const defaults = defaultsFor(domain);

    const groupIds = coerceCsvIds(view["group_ids"]);
    const criteriaIds = coerceCsvIds(view["criteria_ids"]);

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
                          (view[`group_name_${id}`] as string | undefined) ??
                          fallbackGroup.name,
                      weight: coerceFloat(
                          view[`group_weight_${id}`],
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
                      (view[`group_${id}`] as string | undefined) ??
                      fallbackCriterion.groupId;
                  // Plugin also supports legacy `disable_<id>` keys.
                  const legacyDisabled = coerceBool(
                      view[`disable_${id}`],
                      false
                  );
                  return {
                      id,
                      name:
                          (view[`name_${id}`] as string | undefined) ??
                          fallbackCriterion.name,
                      groupId: groupIdSet.has(groupId)
                          ? groupId
                          : groups[0]?.id ?? "",
                      weight: coerceFloat(
                          view[`weight_${id}`],
                          fallbackCriterion.weight
                      ),
                      enabled: legacyDisabled
                          ? false
                          : coerceBool(
                                view[`enabled_${id}`],
                                fallbackCriterion.enabled
                            ),
                      description:
                          (view[`desc_${id}`] as string | undefined) ??
                          fallbackCriterion.description,
                  };
              });

    return { groups, criteria };
}

// Single shared fetch of the merged plugin's config — both domains
// read from the same plugin record, so one network round-trip serves
// both. Promise-level cache so concurrent loads dedupe.
let configFetchPromise: Promise<RawPluginConfig | null> | null = null;

function getRawConfig(): Promise<RawPluginConfig | null> {
    if (!configFetchPromise) {
        configFetchPromise = fetchPluginConfig();
    }
    return configFetchPromise;
}

// Per-domain parsed-result cache so repeat callers don't re-parse.
const parsedCache = new Map<RatingDomain, Promise<RatingConfig>>();

export function loadRatingConfig(
    domain: RatingDomain
): Promise<RatingConfig> {
    const existing = parsedCache.get(domain);
    if (existing) return existing;
    const p = (async () => {
        const raw = await getRawConfig();
        const view = viewForDomain(raw, domain);
        const { groups, criteria } = parseConfig(domain, view);
        return {
            domain,
            groups,
            // Drop disabled criteria — the modal only shows the ones
            // the user has enabled in the plugin's settings panel.
            criteria: criteria.filter((c) => c.enabled),
        };
    })();
    parsedCache.set(domain, p);
    return p;
}

export function invalidateRatingConfig(domain?: RatingDomain): void {
    if (domain) {
        parsedCache.delete(domain);
    } else {
        parsedCache.clear();
    }
    configFetchPromise = null;
}
