import { useEffect, useMemo, useRef, useState } from "react";
import {
    findAllPerformers,
    type PerformerSummary,
} from "../api/queries";
import { useStories } from "../home/useStories";
import { usePerformerProfile } from "../performer/PerformerProfileContext";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; performers: PerformerSummary[] }
    | { kind: "error"; message: string };

type SortMode =
    | "name-asc"
    | "name-desc"
    | "scenes-desc"
    | "scenes-asc"
    | "last-post-desc"
    | "last-post-asc";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "name-asc", label: "Name A → Z" },
    { value: "name-desc", label: "Name Z → A" },
    { value: "scenes-desc", label: "Most scenes" },
    { value: "scenes-asc", label: "Fewest scenes" },
    { value: "last-post-desc", label: "Last post (newest)" },
    { value: "last-post-asc", label: "Last post (oldest)" },
];

// Map<performerStashId, lastActivityIso> for the "last post at" sort.
// Derived from useStories() — the same merged view that powers Home's
// stories row: library scene.date, library created_at, StashDB
// release date, AND Reddit created_utc, all collapsed into one
// per-performer max. Performers with no recent activity are absent.
type LastPostMap = Map<string, string>;

function sortPerformers(
    list: PerformerSummary[],
    mode: SortMode,
    lastPost: LastPostMap
): PerformerSummary[] {
    const copy = list.slice();
    switch (mode) {
        case "name-asc":
            return copy.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            );
        case "name-desc":
            return copy.sort((a, b) =>
                b.name.localeCompare(a.name, undefined, { sensitivity: "base" })
            );
        case "scenes-desc":
            return copy.sort(
                (a, b) => (b.scene_count ?? 0) - (a.scene_count ?? 0)
            );
        case "scenes-asc":
            return copy.sort(
                (a, b) => (a.scene_count ?? 0) - (b.scene_count ?? 0)
            );
        case "last-post-desc":
            // Performers with NO recent activity sort to the bottom in
            // newest-first; we use empty string as a sentinel that
            // localeCompare sees as smaller than any real ISO timestamp.
            return copy.sort((a, b) => {
                const av = lastPost.get(a.id) ?? "";
                const bv = lastPost.get(b.id) ?? "";
                return bv.localeCompare(av);
            });
        case "last-post-asc":
            // Performers with NO recent activity sort to the bottom in
            // oldest-first too — treat "unknown" as max via "￿".
            return copy.sort((a, b) => {
                const av = lastPost.get(a.id) ?? "￿";
                const bv = lastPost.get(b.id) ?? "￿";
                return av.localeCompare(bv);
            });
    }
}

// Following tab: favourited performers up top, all others below, both
// filterable by a single search box and sortable via a small dropdown.
// Performers without scenes are still shown — Stash treats them as
// "in your library" even when they have zero linked scenes.
export function Following() {
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortMode>("name-asc");
    const { openProfile } = usePerformerProfile();
    const scrollRef = useRef<HTMLDivElement>(null);
    useAutoHideTabBar(scrollRef);

    // Re-use the same useStories() data Home renders — already merged
    // (library + StashDB + Reddit) and cached. The per-performer
    // `latestEffectiveAt` is exactly what we need for "last activity".
    const stories = useStories();
    const lastPost = useMemo<LastPostMap>(() => {
        const map: LastPostMap = new Map();
        if (stories.state.kind !== "ready") return map;
        for (const s of stories.state.stories) {
            map.set(s.performerId, s.latestEffectiveAt);
        }
        return map;
    }, [stories.state]);

    useEffect(() => {
        let alive = true;
        findAllPerformers()
            .then((performers) => {
                if (!alive) return;
                setState({ kind: "ready", performers });
            })
            .catch((err: Error) => {
                if (!alive) return;
                setState({ kind: "error", message: err.message });
            });
        return () => {
            alive = false;
        };
    }, []);

    // Filter pass — only re-runs on search/state change. Splitting
    // this from the sort means a single keystroke doesn't re-sort a
    // 1000+ performer library; only the cheaper substring filter
    // re-runs.
    const filtered = useMemo(() => {
        if (state.kind !== "ready") {
            return { fav: [] as PerformerSummary[], oth: [] as PerformerSummary[] };
        }
        const q = search.trim().toLowerCase();
        const source = q
            ? state.performers.filter((p) =>
                  p.name.toLowerCase().includes(q)
              )
            : state.performers;
        const fav: PerformerSummary[] = [];
        const oth: PerformerSummary[] = [];
        for (const p of source) {
            (p.favorite ? fav : oth).push(p);
        }
        return { fav, oth };
    }, [state, search]);

    // Sort pass — only re-runs when sort mode or activity data changes.
    const { favourites, others } = useMemo(
        () => ({
            favourites: sortPerformers(filtered.fav, sort, lastPost),
            others: sortPerformers(filtered.oth, sort, lastPost),
        }),
        [filtered, sort, lastPost]
    );

    return (
        <div className="binge-tab-scroll" ref={scrollRef}>
            <div className="binge-tab-inner">
                <h1 className="binge-tab-title">Following</h1>

                <div className="binge-following-controls">
                    <input
                        type="search"
                        className="binge-following-search"
                        placeholder="Search performers"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search performers"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                    <select
                        className="binge-following-sort"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortMode)}
                        aria-label="Sort performers"
                    >
                        {SORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {state.kind === "loading" && (
                    <div className="binge-status">loading…</div>
                )}
                {state.kind === "error" && (
                    <div className="binge-status binge-status-error">
                        error: {state.message}
                    </div>
                )}
                {state.kind === "ready" && (
                    <>
                        <Section
                            title="Favourites"
                            count={favourites.length}
                            performers={favourites}
                            onPick={openProfile}
                            emptyHint={
                                state.performers.some((p) => p.favorite)
                                    ? "No matches."
                                    : "Favourite some performers in Stash to see them here."
                            }
                            favorite
                        />
                        <Section
                            title="All performers"
                            count={others.length}
                            performers={others}
                            onPick={openProfile}
                            emptyHint="No matches."
                            favorite={false}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

function Section({
    title,
    count,
    performers,
    onPick,
    emptyHint,
    favorite,
}: {
    title: string;
    count: number;
    performers: PerformerSummary[];
    onPick: (id: string) => void;
    emptyHint: string;
    favorite: boolean;
}) {
    return (
        <section className="binge-following-section">
            <header className="binge-following-section-head">
                <h2 className="binge-following-section-title">{title}</h2>
                <span className="binge-following-section-count">{count}</span>
            </header>
            {performers.length === 0 ? (
                <div className="binge-status binge-following-empty">
                    {emptyHint}
                </div>
            ) : (
                <ul className="binge-following-grid">
                    {performers.map((p) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                className={
                                    "binge-follow-card" +
                                    (favorite ? " is-favorite" : "")
                                }
                                onClick={() => onPick(p.id)}
                            >
                                <span
                                    className="binge-follow-avatar"
                                    style={
                                        p.image_path
                                            ? {
                                                  backgroundImage: `url(${p.image_path})`,
                                              }
                                            : undefined
                                    }
                                >
                                    {!p.image_path && (
                                        <span className="binge-follow-initial">
                                            {p.name.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </span>
                                <span className="binge-follow-name">
                                    {p.name}
                                </span>
                                {typeof p.scene_count === "number" &&
                                    p.scene_count > 0 && (
                                        <span className="binge-follow-count">
                                            {p.scene_count} scene
                                            {p.scene_count === 1 ? "" : "s"}
                                        </span>
                                    )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
