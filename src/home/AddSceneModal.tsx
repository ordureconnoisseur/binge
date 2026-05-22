import { useEffect, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
    buildSceneCreateForm,
    getStashDBSceneForCreate,
    submitSceneCreate,
    type SceneCreateForm,
} from "../api/mutations";
import type { StashDBSceneDetail } from "../api/stashdb";
import { useSheetClose } from "../hooks/useSheetClose";

interface AddSceneModalProps {
    stashDBSceneId: string;
    fallbackTitle: string | null;
    fallbackCover: string | null;
    stashboxUrl: string;
    onCreated: (result: { id: string; title: string | null }) => void;
    onClose: () => void;
}

type ModalState =
    | { kind: "loading" }
    | {
          kind: "ready";
          form: SceneCreateForm;
          detail: StashDBSceneDetail | null;
      }
    | {
          kind: "submitting";
          form: SceneCreateForm;
          detail: StashDBSceneDetail | null;
      }
    | {
          kind: "error";
          form: SceneCreateForm;
          detail: StashDBSceneDetail | null;
          message: string;
      };

// Mirrors FollowPerformerModal but for scenes. Auto-fetches the
// StashDB scene detail on mount, presents an editable form with
// the same shape as Stash's "Create Scene" UI, and submits to
// `sceneCreate`. Performer/studio mapping happens during
// buildSceneCreateForm: stash_ids are translated to local IDs
// when those records exist in the user's library.
export function AddSceneModal({
    stashDBSceneId,
    fallbackTitle,
    fallbackCover,
    stashboxUrl,
    onCreated,
    onClose,
}: AddSceneModalProps) {
    const { isExiting, beginClose } = useSheetClose(onClose);
    const [state, setState] = useState<ModalState>({ kind: "loading" });
    const [imageIndex, setImageIndex] = useState(0);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") beginClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [beginClose]);

    useEffect(() => {
        let alive = true;
        (async () => {
            let detail: StashDBSceneDetail | null = null;
            try {
                detail = await getStashDBSceneForCreate(stashDBSceneId);
            } catch (err) {
                console.warn(
                    "[binge] getStashDBSceneForCreate failed",
                    err
                );
            }
            if (!alive) return;
            const form = await buildSceneCreateForm({
                stashDBSceneId,
                detail,
            });
            if (!alive) return;
            // Fall back to the click-source's title + cover if the
            // StashDB lookup didn't populate them.
            const finalForm: SceneCreateForm = {
                ...form,
                title: form.title || fallbackTitle || "",
                cover_image: form.cover_image || fallbackCover || "",
            };
            setState({ kind: "ready", form: finalForm, detail });
            setImageIndex(0);
        })();
        return () => {
            alive = false;
        };
    }, [stashDBSceneId, fallbackTitle, fallbackCover]);

    const updateField = <K extends keyof SceneCreateForm>(
        key: K,
        value: SceneCreateForm[K]
    ) => {
        setState((prev) => {
            if (prev.kind !== "ready" && prev.kind !== "error") return prev;
            return {
                kind: "ready",
                form: { ...prev.form, [key]: value },
                detail: prev.detail,
            };
        });
    };

    const handleSubmit = async () => {
        if (state.kind !== "ready") return;
        const form = state.form;
        const detail = state.detail;
        const submittedForm: SceneCreateForm = {
            ...form,
            cover_image:
                detail?.images[imageIndex]?.url || form.cover_image || "",
        };
        setState({ kind: "submitting", form: submittedForm, detail });
        try {
            const result = await submitSceneCreate(submittedForm);
            onCreated(result);
        } catch (err) {
            setState({
                kind: "error",
                form: submittedForm,
                detail,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    };

    const form = state.kind === "loading" ? null : state.form;
    const detail = state.kind === "loading" ? null : state.detail;
    const isSubmitting = state.kind === "submitting";
    const images = detail?.images ?? [];
    const hasMultipleImages = images.length > 1;
    const currentImage =
        images[imageIndex]?.url || form?.cover_image || "";

    return createPortal(
        <div
            className={
                "binge-sheet-root binge-sheet-root-top" +
                (isExiting ? " is-exiting" : "")
            }
        >
            <div className="binge-sheet-backdrop" onClick={beginClose} />
            <div
                className="binge-sheet binge-follow-modal"
                role="dialog"
                aria-label="Add scene to library"
            >
                <header className="binge-follow-modal-header">
                    <h2>Add scene to library</h2>
                    <button
                        type="button"
                        className="binge-follow-modal-close"
                        onClick={beginClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>

                {state.kind === "loading" && (
                    <div className="binge-follow-modal-loading">
                        Fetching scene metadata from StashDB…
                    </div>
                )}

                {form && (
                    <div className="binge-follow-modal-body">
                        <div className="binge-follow-modal-hero">
                            <div className="binge-follow-modal-hero-wrap">
                                <div
                                    className="binge-follow-modal-hero-img is-scene"
                                    style={
                                        currentImage
                                            ? {
                                                  backgroundImage: `url(${currentImage})`,
                                              }
                                            : undefined
                                    }
                                >
                                    {!currentImage && (
                                        <span className="binge-follow-modal-hero-empty">
                                            no image
                                        </span>
                                    )}
                                </div>
                                {hasMultipleImages && (
                                    <>
                                        <button
                                            type="button"
                                            className="binge-follow-modal-hero-nav is-prev"
                                            onClick={() =>
                                                setImageIndex(
                                                    (imageIndex -
                                                        1 +
                                                        images.length) %
                                                        images.length
                                                )
                                            }
                                            aria-label="Previous photo"
                                        >
                                            <ChevronLeft />
                                        </button>
                                        <button
                                            type="button"
                                            className="binge-follow-modal-hero-nav is-next"
                                            onClick={() =>
                                                setImageIndex(
                                                    (imageIndex + 1) %
                                                        images.length
                                                )
                                            }
                                            aria-label="Next photo"
                                        >
                                            <ChevronRight />
                                        </button>
                                        <div className="binge-follow-modal-hero-counter">
                                            {imageIndex + 1} / {images.length}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="binge-follow-modal-hero-meta">
                                {detail?.studio && (
                                    <div className="binge-follow-modal-stats">
                                        Studio:{" "}
                                        <strong>{detail.studio.name}</strong>
                                        {!form.studioId && (
                                            <span className="binge-follow-modal-not-in-library">
                                                (not in library)
                                            </span>
                                        )}
                                    </div>
                                )}
                                {detail && (
                                    <div className="binge-follow-modal-stats">
                                        {detail.performers.length} performer
                                        {detail.performers.length === 1
                                            ? ""
                                            : "s"}{" "}
                                        on StashDB
                                        {form.performerIds.length <
                                            detail.performers.length && (
                                            <span className="binge-follow-modal-not-in-library">
                                                ({form.performerIds.length}{" "}
                                                in library)
                                            </span>
                                        )}
                                    </div>
                                )}
                                <a
                                    href={stashboxUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="binge-follow-modal-stashdb-link"
                                >
                                    View on StashDB →
                                </a>
                            </div>
                        </div>

                        <div className="binge-follow-modal-grid">
                            <Field
                                label="Title"
                                value={form.title}
                                onChange={(v) => updateField("title", v)}
                                fullWidth
                            />
                            <Field
                                label="Date"
                                value={form.date}
                                type="date"
                                onChange={(v) => updateField("date", v)}
                            />
                            <Field
                                label="Code"
                                value={form.code}
                                onChange={(v) => updateField("code", v)}
                            />
                            <Field
                                label="Director"
                                value={form.director}
                                onChange={(v) => updateField("director", v)}
                                fullWidth
                            />
                            <TextareaField
                                label="URLs (one per line)"
                                value={form.urls}
                                onChange={(v) => updateField("urls", v)}
                                fullWidth
                                rows={3}
                            />
                            <TextareaField
                                label="Details"
                                value={form.details}
                                onChange={(v) => updateField("details", v)}
                                rows={5}
                                fullWidth
                            />
                        </div>

                        {detail && detail.performers.length > 0 && (
                            <div className="binge-follow-modal-coperformers">
                                <span className="binge-follow-modal-coperformers-label">
                                    Performers:
                                </span>
                                {detail.performers.map((p) => (
                                    // We don't have a per-performer
                                    // "in library" flag at this
                                    // level — only the count of
                                    // matched IDs. Chips render
                                    // neutrally; the meta line above
                                    // already shows N of M matched.
                                    <span
                                        key={p.stashId}
                                        className="binge-follow-modal-coperformer-chip"
                                    >
                                        {p.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {state.kind === "error" && (
                            <div className="binge-follow-modal-error">
                                {state.message}
                            </div>
                        )}
                    </div>
                )}

                <footer className="binge-follow-modal-footer">
                    <button
                        type="button"
                        className="binge-follow-modal-cancel"
                        onClick={beginClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="binge-follow-modal-submit"
                        onClick={handleSubmit}
                        disabled={state.kind !== "ready"}
                    >
                        {isSubmitting
                            ? "Adding…"
                            : state.kind === "error"
                              ? "Retry"
                              : "Add to library"}
                    </button>
                </footer>
            </div>
        </div>,
        document.body
    );
}

function Field({
    label,
    value,
    type,
    fullWidth,
    onChange,
}: {
    label: string;
    value: string;
    type?: "text" | "url" | "number" | "date";
    fullWidth?: boolean;
    onChange: (v: string) => void;
}) {
    return (
        <label
            className={
                "binge-follow-modal-label" +
                (fullWidth ? " is-full" : "")
            }
        >
            <span className="binge-follow-modal-label-text">{label}</span>
            <input
                type={type ?? "text"}
                className="binge-follow-modal-input"
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    onChange(e.target.value)
                }
            />
        </label>
    );
}

function TextareaField({
    label,
    value,
    rows,
    fullWidth,
    onChange,
}: {
    label: string;
    value: string;
    rows?: number;
    fullWidth?: boolean;
    onChange: (v: string) => void;
}) {
    return (
        <label
            className={
                "binge-follow-modal-label" +
                (fullWidth ? " is-full" : "")
            }
        >
            <span className="binge-follow-modal-label-text">{label}</span>
            <textarea
                className="binge-follow-modal-textarea"
                value={value}
                rows={rows ?? 2}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    onChange(e.target.value)
                }
            />
        </label>
    );
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 6l-6 6 6 6" />
        </svg>
    );
}
function ChevronRight() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}
