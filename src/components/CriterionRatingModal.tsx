import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSheetClose } from "../hooks/useSheetClose";
import { loadRatingConfig } from "../rating/config";
import { loadRatingPrecision } from "../rating/precision";
import {
    buildUpdatedTagIds,
    computeRating100,
    countCriteriaPerGroup,
    parseRatingsFromTags,
    ratingProgress,
    type TagMin,
} from "../rating/ratings";
import {
    applyPerformerTagIds,
    applySceneTagIds,
    fetchPerformerTagsAndRating,
    fetchSceneTagsAndRating,
    findScoreTag,
} from "../rating/mutations";
import { scoreTagName, type Criterion, type RatingConfig } from "../rating/types";

// Shared criterion-rating modal. Renders ASR's or APR's data model
// (groups → criteria → 0-5 stars) and writes the same tag scheme
// they own. Stash's Python hook recomputes rating100 server-side
// after each update; we re-fetch tags + rating100 to reflect it.

export type RatingTarget =
    | { kind: "scene"; id: string }
    | { kind: "performer"; id: string };

interface Props {
    target: RatingTarget;
    onClose: () => void;
    // Optional callback fires whenever rating100 changes server-side
    // so the caller can sync optimistic UI (e.g. the action stack
    // badge).
    onRatingChange?: (rating100: number | null) => void;
}

type LoadState =
    | { kind: "loading" }
    | {
          kind: "ready";
          config: RatingConfig;
          precision: number;
          tags: TagMin[];
          rating100: number | null;
      }
    | { kind: "error"; message: string };

const SCENE_PLUGIN = "advancedSceneRating";
const PERFORMER_PLUGIN = "advancedPerformerRating";

export function CriterionRatingModal({
    target,
    onClose,
    onRatingChange,
}: Props) {
    const pluginId =
        target.kind === "scene" ? SCENE_PLUGIN : PERFORMER_PLUGIN;
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [pendingCriterionId, setPendingCriterionId] = useState<
        string | null
    >(null);
    const [missingTagWarning, setMissingTagWarning] = useState<
        string | null
    >(null);
    const { isExiting, beginClose } = useSheetClose(onClose);

    // Load config + precision + current tags in parallel on mount.
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [config, precision, initial] = await Promise.all([
                    loadRatingConfig(pluginId),
                    loadRatingPrecision(),
                    target.kind === "scene"
                        ? fetchSceneTagsAndRating(target.id)
                        : fetchPerformerTagsAndRating(target.id),
                ]);
                if (!alive) return;
                setState({
                    kind: "ready",
                    config,
                    precision,
                    tags: initial.tags,
                    rating100: initial.rating100,
                });
            } catch (err) {
                if (!alive) return;
                setState({
                    kind: "error",
                    message:
                        err instanceof Error ? err.message : String(err),
                });
            }
        })();
        return () => {
            alive = false;
        };
    }, [pluginId, target.kind, target.id]);

    // Esc closes (via the same beginClose path so the exit animation plays).
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") beginClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [beginClose]);

    async function setScore(
        criterion: Criterion,
        newScore: number | null
    ): Promise<void> {
        if (state.kind !== "ready") return;
        setPendingCriterionId(criterion.id);
        setMissingTagWarning(null);
        try {
            let newTagId: string | null = null;
            if (newScore !== null) {
                newTagId = await findScoreTag(criterion, newScore);
                if (!newTagId) {
                    // Tag doesn't exist. Don't auto-create — ASR/APR's
                    // settings panel owns the parent-tag hierarchy.
                    const name = scoreTagName(criterion, newScore);
                    setMissingTagWarning(
                        `Score tag "${name}" doesn't exist yet. Open the ${
                            target.kind === "scene"
                                ? "Advanced Scene Rating"
                                : "Advanced Performer Rating"
                        } plugin's settings panel in Stash once — it'll create the tag hierarchy under the right parent. Then try again here.`
                    );
                    return;
                }
            }
            const newIds = buildUpdatedTagIds(
                state.tags,
                criterion,
                newScore,
                newTagId
            );
            if (newIds === null) {
                throw new Error("could not resolve score tag id");
            }
            const updatedTags =
                target.kind === "scene"
                    ? await applySceneTagIds(target.id, newIds)
                    : await applyPerformerTagIds(target.id, newIds);
            // Re-fetch to pick up the plugin hook's recomputed rating100.
            const fresh =
                target.kind === "scene"
                    ? await fetchSceneTagsAndRating(target.id)
                    : await fetchPerformerTagsAndRating(target.id);
            setState({
                kind: "ready",
                config: state.config,
                precision: state.precision,
                tags: fresh.tags.length ? fresh.tags : updatedTags,
                rating100: fresh.rating100,
            });
            onRatingChange?.(fresh.rating100);
        } catch (err) {
            console.warn("[CriterionRatingModal] update failed:", err);
            // Soft fail — keep prior state, don't break the modal.
        } finally {
            setPendingCriterionId(null);
        }
    }

    return createPortal(
        // binge-sheet-root defaults to z:80, but the performer-profile
        // overlay is z:90 — the rating modal needs to win when summoned
        // from there. Extra class lifts it above any other in-app shell.
        // `is-exiting` triggers the close animation; useSheetClose then
        // unmounts after the CSS finishes.
        <div
            className={
                "binge-sheet-root binge-sheet-root-top" +
                (isExiting ? " is-exiting" : "")
            }
        >
            <div
                className="binge-sheet-backdrop"
                onClick={beginClose}
            />
            <div
                className="binge-sheet binge-rating-modal"
                role="dialog"
                aria-label={
                    target.kind === "scene"
                        ? "Rate scene"
                        : "Rate performer"
                }
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <Header state={state} target={target} />
                {missingTagWarning && (
                    <div className="binge-rating-modal-warning" role="alert">
                        {missingTagWarning}
                    </div>
                )}
                <Body
                    state={state}
                    pendingCriterionId={pendingCriterionId}
                    onScore={setScore}
                />
            </div>
        </div>,
        document.body
    );
}

function Header({
    state,
    target,
}: {
    state: LoadState;
    target: RatingTarget;
}) {
    if (state.kind !== "ready") {
        return (
            <header className="binge-rating-modal-header">
                <h2>
                    {target.kind === "scene"
                        ? "Rate scene"
                        : "Rate performer"}
                </h2>
            </header>
        );
    }
    const { rated, total } = ratingProgress(
        parseRatingsFromTags(state.tags, state.config.criteria),
        state.config.criteria
    );
    const rating100 = state.rating100;
    const ratingDisplay =
        rating100 !== null ? Math.round(rating100) + " / 100" : "unrated";
    return (
        <header className="binge-rating-modal-header">
            <h2>
                {target.kind === "scene" ? "Rate scene" : "Rate performer"}
            </h2>
            <div className="binge-rating-modal-summary">
                <span className="binge-rating-modal-rating">
                    {ratingDisplay}
                </span>
                <span className="binge-rating-modal-progress">
                    {rated}/{total} rated
                </span>
            </div>
        </header>
    );
}

function Body({
    state,
    pendingCriterionId,
    onScore,
}: {
    state: LoadState;
    pendingCriterionId: string | null;
    onScore: (criterion: Criterion, newScore: number | null) => void;
}) {
    if (state.kind === "loading") {
        return <div className="binge-rating-modal-empty">loading…</div>;
    }
    if (state.kind === "error") {
        return (
            <div className="binge-rating-modal-empty binge-status-error">
                couldn't load rating config: {state.message}
            </div>
        );
    }
    const { config, precision, tags } = state;
    const ratings = parseRatingsFromTags(tags, config.criteria);
    const byGroup = countCriteriaPerGroup(config);
    // Compute preview rating100 from CURRENT (potentially newer than
    // server's rating100 if a save is in flight). Server value wins
    // once the hook re-fires.
    const previewRating = computeRating100(ratings, config, precision);
    return (
        <div className="binge-rating-modal-body">
            {config.groups.map((group) => {
                const criteria = byGroup.get(group.id) ?? [];
                if (criteria.length === 0) return null;
                const showGroupHeader = config.groups.length > 1;
                return (
                    <section
                        key={group.id}
                        className="binge-rating-modal-group"
                    >
                        {showGroupHeader && (
                            <h3 className="binge-rating-modal-group-title">
                                {group.name}
                            </h3>
                        )}
                        {criteria.map((c) => (
                            <CriterionRow
                                key={c.id}
                                criterion={c}
                                score={ratings[c.id] ?? null}
                                disabled={pendingCriterionId !== null}
                                pending={pendingCriterionId === c.id}
                                onScore={(s) => onScore(c, s)}
                            />
                        ))}
                    </section>
                );
            })}
            {previewRating !== null && (
                <footer className="binge-rating-modal-footer">
                    preview · {Math.round(previewRating)} / 100
                    <small>
                        Stash's plugin hook will lock this in.
                    </small>
                </footer>
            )}
        </div>
    );
}

function CriterionRow({
    criterion,
    score,
    disabled,
    pending,
    onScore,
}: {
    criterion: Criterion;
    score: number | null;
    disabled: boolean;
    pending: boolean;
    onScore: (newScore: number | null) => void;
}) {
    const [hover, setHover] = useState<number | null>(null);
    const filledThrough = hover ?? score ?? 0;
    const stars = useMemo(() => [1, 2, 3, 4, 5], []);
    return (
        <div
            className={
                "binge-rating-modal-row" + (pending ? " is-pending" : "")
            }
        >
            <div className="binge-rating-modal-row-label">
                <span className="binge-rating-modal-row-name">
                    {criterion.name}
                </span>
                {criterion.description && (
                    <span
                        className="binge-rating-modal-row-desc"
                        title={criterion.description}
                    >
                        ⓘ
                    </span>
                )}
            </div>
            <div
                className="binge-rating-modal-row-stars"
                onMouseLeave={() => setHover(null)}
            >
                {stars.map((s) => (
                    <button
                        type="button"
                        key={s}
                        disabled={disabled}
                        className={
                            "binge-rating-modal-star" +
                            (s <= filledThrough ? " is-on" : "")
                        }
                        onMouseEnter={() => setHover(s)}
                        onClick={() => onScore(s)}
                        aria-label={`${criterion.name}: ${s} of 5`}
                    >
                        ★
                    </button>
                ))}
                <button
                    type="button"
                    className="binge-rating-modal-clear"
                    disabled={disabled || score === null}
                    onClick={() => onScore(null)}
                    aria-label={`Clear ${criterion.name} rating`}
                    title="Clear"
                >
                    ×
                </button>
            </div>
        </div>
    );
}
