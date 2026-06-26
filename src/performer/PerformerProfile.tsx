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
import { useSharedStories } from "../home/StoriesContext";
import { useStoryViewer } from "../home/StoryViewerContext";
import { useIncludeX } from "../home/pluginSettings";
import { getXFeed, xHandleFromUrls } from "../api/bingeServer";
import type { Story, StoryScene } from "../home/useStories";
import { BingeLoading } from "../components/BingeLoading";

type ProfileTab = "scenes" | "photos";

// How far back the profile pulls X media for the story ring/viewer.
// Matches the "just their latest stuff" intent — not the whole profile.
const X_STORY_LOOKBACK_DAYS = 7;

// Map a performer's recent X media onto the story system's reddit-shaped
// scene (image/video render path + an x.com CTA). Kept as source:"reddit"
// so the StoryViewer renders it with zero new branches; the x.com domain
// drives the "X" badge. Filtered to the lookback window, newest first.
function xMediaToStoryScenes(
    media: { tweetId: string; tweetUrl: string; kind: "image" | "video"; mediaUrl: string; text?: string; createdUtc: number }[],
    handle: string
): StoryScene[] {
    const cutoff = Math.floor(Date.now() / 1000) - X_STORY_LOOKBACK_DAYS * 86400;
    return media
        .filter((m) => m.createdUtc >= cutoff && m.mediaUrl)
        .map((m) => ({
            id: `x:${m.tweetId}:${m.mediaUrl}`,
            source: "reddit" as const,
            kind: m.kind,
            title: m.text || null,
            body: null,
            mediaUrl: m.mediaUrl,
            linkUrl: null,
            thumbUrl: null,
            permalink: m.tweetUrl || `https://x.com/${handle}`,
            domain: "x.com",
            createdUtc: m.createdUtc,
            effectiveAt: new Date(m.createdUtc * 1000).toISOString(),
        }));
}

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
    const includeX = useIncludeX();
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
    const stories = useSharedStories();
    const storyViewer = useStoryViewer();
    // This performer's existing story (library / reddit / stashdb), if any.
    const sharedStory =
        stories.state.kind === "ready" && currentId
            ? stories.state.stories.find(
                  (s) => s.performerId === currentId
              ) ?? null
            : null;
    // Recent (≤7d) X media for this performer, fetched on demand when the
    // profile opens. Folded into the story so the ring lights up and the
    // viewer shows the X posts — even for performers with NO other recent
    // content (X-only). Empty when no handle / daemon down / disabled.
    const [xScenes, setXScenes] = useState<StoryScene[]>([]);

    const hasStory = !!sharedStory || xScenes.length > 0;
    const openStory = () => {
        const base = sharedStory?.scenes ?? [];
        const merged = [...base, ...xScenes].sort((a, b) =>
            b.effectiveAt.localeCompare(a.effectiveAt)
        );
        if (merged.length === 0 || state.kind !== "ready") return;
        // Open ONLY this performer's story — the user is already on their
        // profile; they shouldn't swipe into someone else's.
        const story: Story = {
            performerId: sharedStory?.performerId ?? state.performer.id,
            performerName: sharedStory?.performerName ?? state.performer.name,
            performerImagePath:
                sharedStory?.performerImagePath ??
                state.performer.image_path,
            performerFavorite: sharedStory?.performerFavorite ?? favorite,
            scenes: merged,
            latestEffectiveAt: merged[0].effectiveAt,
        };
        storyViewer.open([story], 0);
    };

    // Reset tab when the profile changes to a different performer — IG
    // does the same; opening a new profile always lands on the default
    // tab.
    useEffect(() => {
        setTab("scenes");
    }, [currentId]);

    // On-demand X media for the story ring/viewer. Reset immediately on
    // performer change (so a stale strip never lights the wrong ring),
    // then fetch this performer's recent posts if they have a handle.
    useEffect(() => {
        setXScenes([]);
        if (state.kind !== "ready" || !includeX) return;
        const handle = xHandleFromUrls(state.performer.urls);
        if (!handle) return;
        const stashId = Number(state.performer.id);
        let alive = true;
        getXFeed(stashId)
            .then((res) => {
                if (!alive || !res) return;
                setXScenes(xMediaToStoryScenes(res.media, res.handle || handle));
            })
            .catch(() => {
                /* daemon down / blocked — leave the ring to other sources */
            });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentId, includeX, state.kind]);

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
                    {state.kind === "ready" && (
                        <span
                            className={
                                "binge-profile-verified" +
                                (favorite ? " is-favorite" : "")
                            }
                            aria-label={
                                favorite ? "Favourited" : "In library"
                            }
                            title={favorite ? "Favourited" : "In library"}
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
                {state.kind === "loading" && <BingeLoading minHeight="50vh" />}
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

// Instagram's actual verified-badge geometry — a 12-pointed
// starburst with a checkmark inset. Authored on a 40×40 canvas.
// Exported so SceneFeedCard (and any future surface) can reuse
// it without duplicating the path data.
export function VerifiedIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 40 40"
            fill="currentColor"
            fillRule="evenodd"
            aria-hidden="true"
        >
            <path d="M 19.998 3.094 L 14.638 0 l -2.972 5.15 H 5.432 v 6.354 L 0 14.64 L 3.094 20 L 0 25.359 l 5.432 3.137 v 5.905 h 5.975 L 14.638 40 l 5.36 -3.094 L 25.358 40 l 3.232 -5.6 h 6.162 v -6.01 L 40 25.359 L 36.905 20 L 40 14.641 l -5.248 -3.03 v -6.46 h -6.419 L 25.358 0 l -5.36 3.094 Z m 7.415 11.225 l 2.254 2.287 l -11.43 11.5 l -6.835 -6.93 l 2.244 -2.258 l 4.587 4.581 l 9.18 -9.18 Z" />
        </svg>
    );
}
