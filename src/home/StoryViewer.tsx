import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useStoryViewer } from "./StoryViewerContext";
import { StoryProgressStrip } from "./StoryProgressStrip";
import { useMuteState } from "../hooks/useMuteState";
import { MutedIcon, UnmutedIcon } from "../components/MuteToggle";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "../tabs/TabContext";
import { usePerformerProfile } from "../performer/PerformerProfileContext";
import { timeAgo } from "./timeAgo";
import {
    rewriteRedditMediaUrl,
    rewriteRedgifsMediaUrl,
} from "../api/bingeServer";
import type { StoryScene } from "./useStories";

type RedditStoryScene = Extract<StoryScene, { source: "reddit" }>;

// Max time a story item is shown when the preview WebM doesn't auto-end
// within that window. Mirrors IG's "stories run for a bounded time."
const PREVIEW_CAP_MS = 15_000;
// Shorter cap when we have only a still screenshot (no preview WebM).
const STILL_CAP_MS = 5_000;
// Reddit text/link cards — enough to read a paragraph but not loiter.
const TEXT_LINK_CAP_MS = 8_000;

// IG-style story viewer. Portalled to <body>, only renders when the
// context has isOpen=true. Drives a single <video> through each
// performer's `scenes` array; auto-advances on `ended` or on the cap
// timer, whichever fires first.
export function StoryViewer() {
    const {
        isOpen,
        stories,
        activeIndex,
        setActiveIndex,
        close,
    } = useStoryViewer();
    const { replace } = useFilter();
    const { setTab, setPinFirstSceneId, setReelMode } = useTab();
    const { openProfile } = usePerformerProfile();

    const [sceneIndex, setSceneIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [progress, setProgress] = useState(0);
    const [muted, setMuted] = useMuteState();

    const videoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef<number | null>(null);
    const startRef = useRef<number>(0);
    const accumRef = useRef<number>(0);

    const activeStory = stories[activeIndex];
    const currentScene = activeStory?.scenes[sceneIndex];
    // Per-source cap: video-bearing slides get 15s, stills 5s, reddit
    // text/link cards 8s (enough to read a paragraph).
    const capMs = ((): number => {
        if (!currentScene) return STILL_CAP_MS;
        if (currentScene.source === "library") {
            return currentScene.preview ? PREVIEW_CAP_MS : STILL_CAP_MS;
        }
        if (currentScene.source === "stashdb") return STILL_CAP_MS;
        // reddit
        switch (currentScene.kind) {
            case "video":
                return PREVIEW_CAP_MS;
            case "image":
                return STILL_CAP_MS;
            case "text":
            case "link":
            default:
                return TEXT_LINK_CAP_MS;
        }
    })();

    // Reset sceneIndex whenever the focused performer changes. Don't
    // reset on simple sceneIndex-bumps from within the same performer.
    useEffect(() => {
        setSceneIndex(0);
        setPaused(false);
    }, [activeIndex]);

    // Reset progress + accumulator on scene/performer change.
    useEffect(() => {
        accumRef.current = 0;
        setProgress(0);
    }, [activeIndex, sceneIndex]);

    const advance = useCallback(() => {
        if (!activeStory) return;
        if (sceneIndex < activeStory.scenes.length - 1) {
            setSceneIndex((i) => i + 1);
            return;
        }
        if (activeIndex < stories.length - 1) {
            setActiveIndex(activeIndex + 1);
            return;
        }
        close();
    }, [activeStory, sceneIndex, activeIndex, stories.length, setActiveIndex, close]);

    const goPrev = useCallback(() => {
        if (sceneIndex > 0) {
            setSceneIndex((i) => i - 1);
            return;
        }
        if (activeIndex > 0) {
            const prevStory = stories[activeIndex - 1];
            setActiveIndex(activeIndex - 1);
            // The activeIndex effect will reset sceneIndex to 0; we want
            // the LAST scene of the previous performer. Schedule a follow-up.
            setTimeout(() => {
                setSceneIndex(Math.max(0, prevStory.scenes.length - 1));
            }, 0);
        }
        // At first performer + first scene: no-op.
    }, [activeIndex, sceneIndex, stories, setActiveIndex]);

    // Drive the progress bar via requestAnimationFrame; advance when full.
    useEffect(() => {
        if (!isOpen) return;
        if (paused) {
            // Capture elapsed-since-resume into the accumulator so the
            // next play continues from the same fraction.
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            accumRef.current += performance.now() - startRef.current;
            return;
        }
        startRef.current = performance.now();
        const tick = (now: number) => {
            const elapsed = accumRef.current + (now - startRef.current);
            const fraction = Math.min(1, elapsed / capMs);
            setProgress(fraction);
            if (fraction >= 1) {
                rafRef.current = null;
                advance();
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isOpen, paused, capMs, activeIndex, sceneIndex, advance]);

    // Sync the <video> element's play state with our `paused` flag.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (paused) {
            video.pause();
        } else {
            video.muted = muted;
            void video.play().catch(() => {
                // Autoplay may need muted; retry muted, then accept failure
                // (the progress timer still advances).
                video.muted = true;
                if (!muted) setMuted(true);
                void video.play().catch(() => {});
            });
        }
    }, [paused, sceneIndex, activeIndex, muted, setMuted]);

    // Keep <video>.muted in sync when the user toggles mute mid-story.
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.muted = muted;
    }, [muted]);

    // Keyboard nav, mirroring ImageLightbox.
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
            else if (e.key === "ArrowLeft") goPrev();
            else if (e.key === "ArrowRight") advance();
            else if (e.key === " ") {
                e.preventDefault();
                setPaused((p) => !p);
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, close, goPrev, advance]);

    if (!isOpen || !activeStory || !currentScene) return null;

    const handleCta = () => {
        if (currentScene.source === "stashdb") {
            // StashDB scenes aren't in the library — there's nothing
            // to play. Open the StashDB page so the user can browse
            // full metadata + decide whether to grab the scene.
            window.open(
                currentScene.stashboxUrl,
                "_blank",
                "noopener,noreferrer"
            );
            close();
            return;
        }
        if (currentScene.source === "reddit") {
            // Reddit posts open on reddit.com in a new tab — that's
            // where comments + interaction live.
            window.open(
                currentScene.permalink,
                "_blank",
                "noopener,noreferrer"
            );
            close();
            return;
        }
        // Library scene — existing reel-entry flow.
        // Defensive reset: if the user was in chained mode (entered
        // the reel via Explore earlier), the "Watch full scene" CTA
        // is a fresh, filter-driven random entry. Don't carry
        // chained state into it.
        setReelMode("random");
        replace({
            performers: [
                {
                    id: activeStory.performerId,
                    name: activeStory.performerName,
                    image_path: activeStory.performerImagePath,
                },
            ],
            tags: [],
            studios: [],
        });
        setPinFirstSceneId(currentScene.id);
        setTab("foryou");
        close();
    };

    // Adjacent peeks. ±1 is the primary peek; ±2 sits further out and
    // dimmer. Out-of-range indices simply omit a peek.
    const leftPeeks = [activeIndex - 2, activeIndex - 1]
        .filter((i) => i >= 0)
        .map((i) => stories[i]);
    const rightPeeks = [activeIndex + 1, activeIndex + 2]
        .filter((i) => i < stories.length)
        .map((i) => stories[i]);

    return createPortal(
        <div
            className="binge-story-viewer-root"
            role="dialog"
            aria-label="Story viewer"
        >
            <div
                className="binge-story-viewer-backdrop"
                onClick={close}
                aria-hidden="true"
            />
            <button
                type="button"
                className="binge-story-viewer-close"
                onClick={close}
                aria-label="Close"
            >
                ×
            </button>
            {/* Desktop chevrons. Pinned to the viewport edges so they
                never crowd the focused card regardless of how many
                peeks are showing. Hidden on narrow viewports — touch
                users have the in-card tap zones. */}
            <button
                type="button"
                className="binge-story-viewer-chevron binge-story-viewer-chevron-prev"
                onClick={goPrev}
                aria-label="Previous"
                disabled={activeIndex === 0 && sceneIndex === 0}
            >
                <ChevronLeft />
            </button>
            <button
                type="button"
                className="binge-story-viewer-chevron binge-story-viewer-chevron-next"
                onClick={advance}
                aria-label="Next"
            >
                <ChevronRight />
            </button>
            <div className="binge-story-viewer-stage">
                <div className="binge-story-viewer-peeks binge-story-viewer-peeks-left">
                    {leftPeeks.map((p, idx) => (
                        <Peek
                            key={p.performerId}
                            story={p}
                            distance={leftPeeks.length - idx}
                            onClick={() =>
                                setActiveIndex(activeIndex - (leftPeeks.length - idx))
                            }
                        />
                    ))}
                </div>

                <div className="binge-story-viewer-card">
                    {currentScene.source === "library" && (
                        <video
                            ref={videoRef}
                            className={
                                "binge-story-viewer-video" +
                                (currentScene.width !== null &&
                                currentScene.height !== null &&
                                currentScene.height > currentScene.width
                                    ? " is-portrait"
                                    : "")
                            }
                            key={currentScene.id}
                            src={currentScene.preview ?? undefined}
                            poster={currentScene.screenshot ?? undefined}
                            playsInline
                            muted={muted}
                            onEnded={advance}
                        />
                    )}
                    {currentScene.source === "stashdb" && (
                        <img
                            className="binge-story-viewer-image"
                            key={currentScene.id}
                            src={currentScene.cover ?? undefined}
                            alt={currentScene.title ?? "StashDB scene"}
                        />
                    )}
                    {currentScene.source === "reddit" && (
                        <RedditCardBody
                            scene={currentScene}
                            videoRef={videoRef}
                            muted={muted}
                            onEnded={advance}
                        />
                    )}

                    <div className="binge-story-viewer-header">
                        <StoryProgressStrip
                            sceneCount={activeStory.scenes.length}
                            currentIndex={sceneIndex}
                            progress={progress}
                        />
                        <div className="binge-story-viewer-meta">
                            <button
                                type="button"
                                className="binge-story-viewer-performer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openProfile(activeStory.performerId);
                                    close();
                                }}
                                aria-label={`Open ${activeStory.performerName}'s profile`}
                                title="Open profile"
                            >
                                <span
                                    className="binge-story-viewer-avatar"
                                    style={
                                        activeStory.performerImagePath
                                            ? {
                                                  backgroundImage: `url(${activeStory.performerImagePath})`,
                                              }
                                            : undefined
                                    }
                                    aria-hidden="true"
                                />
                                <span className="binge-story-viewer-name">
                                    {activeStory.performerName}
                                </span>
                            </button>
                            <span className="binge-story-viewer-time">
                                {timeAgo(currentScene.effectiveAt)}
                            </span>
                            {currentScene.source === "stashdb" && (
                                <span
                                    className="binge-story-viewer-source-badge"
                                    title="From StashDB — not in your library"
                                >
                                    StashDB
                                </span>
                            )}
                            {currentScene.source === "reddit" && (
                                <span
                                    className="binge-story-viewer-source-badge"
                                    title={
                                        currentScene.mediaUrl ??
                                        currentScene.linkUrl ??
                                        currentScene.permalink
                                    }
                                >
                                    {redditBadgeLabel(currentScene)}
                                </span>
                            )}
                            <button
                                type="button"
                                className="binge-story-viewer-mute"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setMuted(!muted);
                                }}
                                aria-label={muted ? "Unmute" : "Mute"}
                                title={muted ? "Unmute" : "Mute"}
                            >
                                {muted ? <MutedIcon /> : <UnmutedIcon />}
                            </button>
                        </div>
                    </div>

                    {/* Tap zones. Order matters — sit above the video,
                        below the header/footer overlays so the chrome
                        captures its own clicks. */}
                    <button
                        type="button"
                        className="binge-story-viewer-tap binge-story-viewer-tap-left"
                        onClick={goPrev}
                        aria-label="Previous"
                        tabIndex={-1}
                    />
                    <button
                        type="button"
                        className="binge-story-viewer-tap binge-story-viewer-tap-center"
                        onClick={() => setPaused((p) => !p)}
                        aria-label={paused ? "Resume" : "Pause"}
                        tabIndex={-1}
                    />
                    <button
                        type="button"
                        className="binge-story-viewer-tap binge-story-viewer-tap-right"
                        onClick={advance}
                        aria-label="Next"
                        tabIndex={-1}
                    />

                    <div className="binge-story-viewer-footer">
                        {currentScene.title && (
                            <div className="binge-story-viewer-caption">
                                {currentScene.title}
                            </div>
                        )}
                        <button
                            type="button"
                            className="binge-story-viewer-cta"
                            onClick={handleCta}
                        >
                            {currentScene.source === "stashdb"
                                ? "View on StashDB →"
                                : currentScene.source === "reddit"
                                  ? "Open on Reddit →"
                                  : "Watch full scene →"}
                        </button>
                    </div>
                </div>

                <div className="binge-story-viewer-peeks binge-story-viewer-peeks-right">
                    {rightPeeks.map((p, idx) => (
                        <Peek
                            key={p.performerId}
                            story={p}
                            distance={idx + 1}
                            onClick={() => setActiveIndex(activeIndex + idx + 1)}
                        />
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 18l-6-6 6-6" />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
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

// Compact source label for the header pill on reddit posts. Lets us
// tell at a glance whether a video that won't play is a redgifs failure
// (CDN block / referrer / etc.) vs a v.redd.it issue vs an image post
// vs something else.
function redditBadgeLabel(scene: RedditStoryScene): string {
    const d = (scene.domain ?? "").toLowerCase();
    if (scene.kind === "video") {
        if (d.includes("redgifs")) return "redgifs";
        if (d === "v.redd.it") return "reddit video";
        return d || "video";
    }
    if (scene.kind === "image") {
        if (d === "i.redd.it") return "reddit image";
        return d || "image";
    }
    if (scene.kind === "text") return "reddit text";
    return d || "reddit link";
}

// Reddit card body: switches on `kind` to render image / video / text /
// link. Video shares the same ref as library so the existing mute +
// pause-sync effects keep working.
function RedditCardBody({
    scene,
    videoRef,
    muted,
    onEnded,
}: {
    scene: RedditStoryScene;
    videoRef: RefObject<HTMLVideoElement | null>;
    muted: boolean;
    onEnded: () => void;
}) {
    const [videoError, setVideoError] = useState<string | null>(null);

    // Reset error when scene id changes (next slide).
    useEffect(() => {
        setVideoError(null);
    }, [scene.id]);

    // Set referrerpolicy BEFORE the src triggers a load — redgifs
    // (and similar anti-hotlink CDNs) 403 any request whose Referer
    // isn't their own origin. Browsers fire the network request as
    // soon as the element commits with src; useEffect runs too late.
    // A callback ref lets us setAttribute and src in deterministic
    // order on the same DOM node.
    const setVideoRef = (el: HTMLVideoElement | null) => {
        videoRef.current = el;
        if (!el) return;
        el.setAttribute("referrerpolicy", "no-referrer");
        if (scene.kind === "video" && scene.mediaUrl) {
            const src = rewriteRedgifsMediaUrl(scene.mediaUrl);
            if (src && el.src !== src) el.src = src;
        }
    };

    if (scene.kind === "image") {
        // Proxy Reddit-hosted images through binge-server for the same
        // referrer / firewall reasons we proxy redgifs videos. The
        // helper passes through unchanged for non-Reddit URLs.
        const rawImg = scene.mediaUrl ?? scene.thumbUrl;
        const imgSrc = rewriteRedditMediaUrl(rawImg) ?? undefined;
        return (
            <img
                className="binge-story-viewer-image"
                key={scene.id}
                src={imgSrc}
                referrerPolicy="no-referrer"
                alt={scene.title ?? "Reddit image"}
            />
        );
    }
    if (scene.kind === "video") {
        return (
            <>
                <video
                    ref={setVideoRef}
                    className="binge-story-viewer-video"
                    key={scene.id}
                    poster={rewriteRedditMediaUrl(scene.thumbUrl) ?? undefined}
                    playsInline
                    muted={muted}
                    onEnded={onEnded}
                    onError={(e) => {
                        const v = e.currentTarget;
                        const err = v.error;
                        setVideoError(
                            err
                                ? `MediaError ${err.code} (${err.message || "no message"})`
                                : "unknown video error"
                        );
                    }}
                />
                {videoError && (
                    <div className="binge-story-viewer-video-error">
                        <div>Video playback failed</div>
                        <code>{videoError}</code>
                        <code style={{ wordBreak: "break-all" }}>
                            {scene.mediaUrl}
                        </code>
                    </div>
                )}
            </>
        );
    }
    if (scene.kind === "text") {
        return (
            <div
                className="binge-story-viewer-text"
                key={scene.id}
                aria-label={scene.title ?? "Reddit text post"}
            >
                {scene.title && (
                    <h2 className="binge-story-viewer-text-title">
                        {scene.title}
                    </h2>
                )}
                {scene.body && (
                    <p className="binge-story-viewer-text-body">
                        {truncate(scene.body, 600)}
                    </p>
                )}
            </div>
        );
    }
    // link
    const linkThumb = rewriteRedditMediaUrl(scene.thumbUrl);
    return (
        <div
            className="binge-story-viewer-link"
            key={scene.id}
            style={
                linkThumb
                    ? { backgroundImage: `url(${linkThumb})` }
                    : undefined
            }
        >
            <div className="binge-story-viewer-link-overlay">
                {scene.domain && (
                    <span className="binge-story-viewer-link-domain">
                        {scene.domain}
                    </span>
                )}
                {scene.title && (
                    <h2 className="binge-story-viewer-link-title">
                        {scene.title}
                    </h2>
                )}
            </div>
        </div>
    );
}

function truncate(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return text.slice(0, limit).trimEnd() + "…";
}

// Shrunken adjacent story. Uses the latest scene's screenshot as a still
// background — no <video> here, peeks must stay cheap.
function Peek({
    story,
    distance,
    onClick,
}: {
    story: import("./useStories").Story;
    distance: number;
    onClick: () => void;
}) {
    const latest = story.scenes[0];
    return (
        <button
            type="button"
            className={`binge-story-viewer-peek is-distance-${distance}`}
            onClick={onClick}
            aria-label={`View ${story.performerName}'s story`}
            style={(() => {
                if (!latest) return undefined;
                // Library scenes have `screenshot`; StashDB scenes have
                // `cover`; reddit posts have `thumbUrl` (or `mediaUrl`
                // when the post is an image). Use whichever the source
                // provides as the peek thumbnail.
                let bg: string | null = null;
                if (latest.source === "library") bg = latest.screenshot;
                else if (latest.source === "stashdb") bg = latest.cover;
                else if (latest.source === "reddit")
                    bg = latest.thumbUrl ?? latest.mediaUrl;
                return bg
                    ? { backgroundImage: `url(${bg})` }
                    : undefined;
            })()}
        >
            <span className="binge-story-viewer-peek-name">
                {story.performerName}
            </span>
        </button>
    );
}
