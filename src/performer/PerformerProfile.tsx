import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { findPerformer, type PerformerDetail } from "../api/queries";
import { setPerformerFavorite } from "../api/mutations";
import { useHasAdvancedRating } from "../plugins/PluginContext";
import { usePerformerProfile } from "./PerformerProfileContext";
import { StashDBPerformerProfile } from "./StashDBPerformerProfile";
import { PerformerStatsRow } from "./PerformerStatsRow";
import { PerformerBio } from "./PerformerBio";
import { PerformerSceneGrid } from "./PerformerSceneGrid";
import { PerformerImageGrid } from "./PerformerImageGrid";
import { CriterionRatingModal } from "../components/CriterionRatingModal";
import { PerformerMoreSheet } from "./PerformerMoreSheet";
import { useStories } from "../home/useStories";
import { useStoryViewer } from "../home/StoryViewerContext";

type ProfileTab = "scenes" | "photos";

type LoadState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; performer: PerformerDetail }
    | { kind: "error"; message: string };

// Full-screen Instagram-style performer profile. Mounted once at the root
// (App.tsx) and toggled by usePerformerProfile().currentId. Portalled to
// <body> for the same reason PerformerSheet is: the slide's `.binge-overlay`
// is its own stacking context, which would cap our z-index beneath the
// action-stack heart and other slide UI.
// Branch wrapper: PerformerProfileContext can now point at either a
// local Stash performer (`kind: "local"`) or a StashDB-only performer
// (`kind: "stashdb"`). The local case is the existing
// `LocalPerformerProfile` below; the StashDB case forwards to
// `StashDBPerformerProfile` which renders StashDB data + their
// StashDB scenes with "Add to library" tap targets.
export function PerformerProfile() {
    const { currentProfile } = usePerformerProfile();
    if (!currentProfile) return null;
    if (currentProfile.kind === "stashdb") {
        return (
            <StashDBPerformerProfile
                stashDBPerformerId={currentProfile.id}
            />
        );
    }
    return <LocalPerformerProfile localId={currentProfile.id} />;
}

function LocalPerformerProfile({ localId }: { localId: string }) {
    const currentId = localId;
    const { close } = usePerformerProfile();
    const [state, setState] = useState<LoadState>({ kind: "idle" });
    // Local favorite mirror so the Follow button responds instantly without
    // refetching the whole performer. Synced from the fetched performer.
    const [favorite, setFavorite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [tab, setTab] = useState<ProfileTab>("scenes");
    const [ratingOpen, setRatingOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    // Bumped by the refresh action in the ⋯ menu — forces the fetch
    // effect below to re-run by changing one of its deps.
    const [refreshTick, setRefreshTick] = useState(0);
    const bodyRef = useRef<HTMLDivElement>(null);
    const hasAdvancedRating = useHasAdvancedRating();
    // If this performer is in the stories list, the avatar gets the
    // IG-style gradient ring + becomes a tap-to-open-story trigger.
    // useStories internally caches its fetches so re-mounting in
    // PerformerProfile doesn't re-hit the network if Home already
    // populated.
    const stories = useStories();
    const storyViewer = useStoryViewer();
    const storyIndex =
        stories.state.kind === "ready" && currentId
            ? stories.state.stories.findIndex(
                  (s) => s.performerId === currentId
              )
            : -1;
    const hasStory = storyIndex >= 0;
    const openStory = () => {
        if (!hasStory || stories.state.kind !== "ready") return;
        // Open ONLY this performer's story — don't pass the whole list,
        // because the user is already on their profile; they shouldn't
        // accidentally swipe into someone else's story.
        const performerStory = stories.state.stories[storyIndex];
        storyViewer.open([performerStory], 0);
    };

    // Reset tab when the profile changes to a different performer — IG
    // does the same; opening a new profile always lands on the default
    // tab.
    useEffect(() => {
        setTab("scenes");
    }, [currentId]);

    useEffect(() => {
        if (!currentId) {
            setState({ kind: "idle" });
            return;
        }
        let alive = true;
        setState({ kind: "loading" });
        findPerformer(currentId)
            .then((performer) => {
                if (!alive) return;
                setState({ kind: "ready", performer });
                setFavorite(performer.favorite);
            })
            .catch((err: Error) => {
                if (!alive) return;
                setState({ kind: "error", message: err.message });
            });
        return () => {
            alive = false;
        };
    }, [currentId, refreshTick]);

    useEffect(() => {
        if (!currentId) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [currentId, close]);

    // Sticky-header opacity ramp: 0–80px scroll → transparent → glass.
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const handler = () => setScrolled(el.scrollTop > 12);
        handler();
        el.addEventListener("scroll", handler, { passive: true });
        return () => el.removeEventListener("scroll", handler);
    }, [state.kind]);

    if (!currentId) return null;

    const handleFollow = async () => {
        if (busy || state.kind !== "ready") return;
        setBusy(true);
        const previous = favorite;
        const next = !previous;
        setFavorite(next);
        // Safety: if the mutation hangs (network stall, server stuck), don't
        // leave the button disabled-forever — race against an 8s timeout and
        // log the outcome so we can diagnose if this trips.
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error("setPerformerFavorite timeout (8s)")),
                8000
            )
        );
        try {
            const confirmed = (await Promise.race([
                setPerformerFavorite(state.performer.id, next),
                timeout,
            ])) as boolean;
            setFavorite(confirmed);
        } catch (err) {
            console.error("[binge] performer favorite mutation failed", err);
            setFavorite(previous);
        } finally {
            setBusy(false);
        }
    };

    return createPortal(
        <div className="binge-profile-root" role="dialog" aria-label="Performer profile">
            <header
                className={
                    "binge-profile-topbar" +
                    (scrolled ? " is-scrolled" : "")
                }
            >
                <button
                    type="button"
                    className="binge-profile-back"
                    onClick={close}
                    aria-label="Close profile"
                >
                    <BackIcon />
                </button>
                <span className="binge-profile-topbar-name">
                    {state.kind === "ready" ? state.performer.name : ""}
                    {state.kind === "ready" && favorite && (
                        <span
                            className="binge-profile-verified"
                            aria-label="Favourited"
                            title="Favourited"
                        >
                            <VerifiedIcon />
                        </span>
                    )}
                </span>
                <button
                    type="button"
                    className="binge-profile-more"
                    aria-label="More actions"
                    title="More"
                    onClick={() => setMoreOpen(true)}
                >
                    <MoreIcon />
                </button>
            </header>
            <div className="binge-profile-body" ref={bodyRef}>
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
                        <section className="binge-profile-hero">
                            <ProfileAvatar
                                imagePath={state.performer.image_path}
                                name={state.performer.name}
                                hasStory={hasStory}
                                onOpenStory={openStory}
                            />
                            <PerformerStatsRow
                                sceneCount={state.performer.scene_count}
                                oCounter={state.performer.o_counter}
                                rating100={state.performer.rating100}
                            />
                        </section>
                        <PerformerBio
                            performer={state.performer}
                            nameAccessory={
                                hasAdvancedRating ? (
                                    <button
                                        type="button"
                                        className="binge-profile-rate"
                                        onClick={() => setRatingOpen(true)}
                                        aria-label="Rate performer"
                                        title="Rate (advanced)"
                                    >
                                        ★
                                    </button>
                                ) : null
                            }
                        />
                        <div className="binge-profile-actions">
                            <button
                                type="button"
                                className={
                                    "binge-follow-btn binge-profile-follow" +
                                    (favorite ? " is-following" : "")
                                }
                                onClick={handleFollow}
                                disabled={busy}
                                aria-pressed={favorite}
                            >
                                {favorite ? "Favourited" : "Favourite"}
                            </button>
                        </div>
                        {ratingOpen && state.kind === "ready" && (
                            <CriterionRatingModal
                                target={{
                                    kind: "performer",
                                    id: state.performer.id,
                                }}
                                onClose={() => setRatingOpen(false)}
                            />
                        )}
                        {moreOpen && state.kind === "ready" && (
                            <PerformerMoreSheet
                                performerId={state.performer.id}
                                onRefresh={() =>
                                    setRefreshTick((n) => n + 1)
                                }
                                onClose={() => setMoreOpen(false)}
                            />
                        )}
                        <div
                            className="binge-profile-tabs"
                            role="tablist"
                            aria-label="Profile content"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "scenes"}
                                className={
                                    "binge-profile-tab" +
                                    (tab === "scenes" ? " is-active" : "")
                                }
                                onClick={() => setTab("scenes")}
                            >
                                Scenes
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "photos"}
                                className={
                                    "binge-profile-tab" +
                                    (tab === "photos" ? " is-active" : "")
                                }
                                onClick={() => setTab("photos")}
                            >
                                Photos
                            </button>
                        </div>
                        {tab === "scenes" ? (
                            <PerformerSceneGrid
                                performer={state.performer}
                                onClose={close}
                            />
                        ) : (
                            <PerformerImageGrid performer={state.performer} />
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

// Performer hero avatar. Renders a plain span when the performer has
// no current story, or a button wrapped in the IG-style gradient
// ring when one exists — tapping opens the story viewer at this
// performer (same UX as the home stories row).
function ProfileAvatar({
    imagePath,
    name,
    hasStory,
    onOpenStory,
}: {
    imagePath: string | null;
    name: string;
    hasStory: boolean;
    onOpenStory: () => void;
}) {
    const inner = (
        <span
            className="binge-profile-avatar"
            style={
                imagePath
                    ? { backgroundImage: `url(${imagePath})` }
                    : undefined
            }
        >
            {!imagePath && (
                <span className="binge-profile-avatar-initial">
                    {name.charAt(0).toUpperCase()}
                </span>
            )}
        </span>
    );
    if (!hasStory) return inner;
    return (
        <button
            type="button"
            className="binge-profile-avatar-ring"
            onClick={onOpenStory}
            aria-label={`View ${name}'s story`}
            title="View story"
        >
            {inner}
        </button>
    );
}

function BackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
        </svg>
    );
}

function MoreIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
        </svg>
    );
}

function VerifiedIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 2l2.39 2.45 3.4-.43.95 3.3 3.26 1.1-1.34 3.18L22 14.6l-2.7 2.1.43 3.4-3.3.95L15.05 24 12 22.5 8.95 24 7.6 21.05l-3.3-.95.43-3.4L2 14.6l1.34-3 -1.34-3.18 3.26-1.1.95-3.3 3.4.43L12 2zm-1.2 13.6l5.66-5.66-1.4-1.4-4.26 4.24-2.1-2.1-1.4 1.4 3.5 3.52z" />
        </svg>
    );
}
