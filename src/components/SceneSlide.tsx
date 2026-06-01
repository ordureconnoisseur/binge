import { useEffect, useMemo, useRef, useState } from "react";
import type { BingeScene } from "../api/queries";
import { ActionStack } from "./ActionStack";
import { PerformerRow } from "./PerformerRow";
import { pickStreamUrl } from "../util/pickStream";
import { MuteToggle } from "./MuteToggle";
import { SceneProgress } from "./SceneProgress";
import { getPersistedMuted, useMuteState } from "../hooks/useMuteState";
import {
    sceneDecrementO,
    sceneIncrementO,
    setSceneRating,
} from "../api/mutations";
import { recordTagInteractions } from "../api/interactedTags";
import {
    getCollections,
    getCollectionTagIds,
    setSceneInCollection,
    subscribeCollections,
} from "../api/collections";
import {
    isInMultiviewQueue,
    toggleMultiviewQueueScene,
    openMultiviewPlayer,
    MULTIVIEW_STORAGE_KEY,
} from "../api/multiview";
import { HeartBurst } from "./HeartBurst";
import { SceneDetailsSheet } from "./SceneDetailsSheet";
import { CriterionRatingModal } from "./CriterionRatingModal";
import { MoreSheet } from "./MoreSheet";
import {
    useAutoScroll,
    useTranscodeType,
    readDemoMode,
} from "../home/pluginSettings";
import { useScribeModal } from "../scribe/ScribeContext";

interface SceneSlideProps {
    scene: BingeScene;
    // Whether this slide should aggressively buffer (preload="auto"). With
    // virtualization mounting only ~3 slides at a time, "auto" is safe.
    preload?: "auto" | "metadata" | "none";
    // Called when this slide becomes the dominant intersecting one (>= 0.6).
    // Used by the parent Reel to track activeIndex for pagination triggers.
    onActive?: (sceneId: string) => void;
    // Lifted O-count: Reel owns the canonical optimistic value so it
    // survives unmount/remount when the slide scrolls out of the
    // virtualizer's overscan window. If undefined, falls back to the
    // server-shipped scene.o_counter.
    oCountOverride?: number;
    onOCountChange?: (sceneId: string, next: number) => void;
    // Same lifted-override pattern for rating + favourite — Reel owns
    // the canonical state, SceneSlide reads override-or-server-value.
    ratingOverride?: number | null;
    onRatingChange?: (sceneId: string, next: number | null) => void;
    // Per-collection membership for the bookmark menu — keys are
    // tagName values from BINGE_COLLECTIONS. Reel owns the canonical
    // map across virtualizer mount/unmount.
    collectionsOverride?: Record<string, boolean>;
    onCollectionChange?: (
        sceneId: string,
        tagName: string,
        next: boolean
    ) => void;
    // True while the parent Reel is mid-scroll. We defer assigning
    // video.src until scroll settles — without this, every transient
    // slide allocated during a fast flick takes a hardware decoder
    // slot. Managed IMPERATIVELY via useEffect (not a React prop on
    // <video>), because toggling the src prop between undefined and
    // a URL doesn't reliably re-trigger load() in any browser.
    currentlyScrolling?: boolean;
    // Auto-scroll: when the user has it enabled in MoreSheet, the
    // active slide's video should NOT loop and should advance to the
    // next slide on its `ended` event.
    onAutoAdvance?: () => void;
}

// One slide of the reel. Owns:
//   - its <video> element
//   - an IntersectionObserver that plays when on-screen and pauses off-screen
//   - the overlay (title, performers, tags)
//
// Why each slide owns its own observer instead of a parent-managed "current
// index": scroll-snap doesn't guarantee a single visible item at the moment
// of snap; with one observer per slide we get clean transitions even mid-snap.
// One burst per like-trigger. Auto-cleaned BURST_LIFETIME_MS after spawn.
interface Burst {
    id: number;
}
const BURST_LIFETIME_MS = 2700;
// Window in which a second tap counts as a double-tap. 280ms is the
// browser convention. Single-click play/pause is delayed by this amount.
const DOUBLE_TAP_WINDOW_MS = 280;

export function SceneSlide({
    scene,
    preload = "metadata",
    onActive,
    oCountOverride,
    onOCountChange,
    ratingOverride,
    onRatingChange,
    collectionsOverride,
    onCollectionChange,
    currentlyScrolling = false,
    onAutoAdvance,
}: SceneSlideProps) {
    const autoScroll = useAutoScroll();
    // Reactive — re-points mounted <video> src when the user changes
    // the stream type in Settings (the old getTranscodeType() read was
    // non-reactive, so mounted slides kept the stale stream).
    const transcodeType = useTranscodeType();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [muted, setMuted, setMutedSession] = useMuteState();
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [advancedRatingOpen, setAdvancedRatingOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    // Like state. Optimistic value lives here AND in the parent Reel
    // (oCountOverride) so a remount after scroll-away inherits the
    // user's most recent like rather than the stale server value.
    const [oCount, setOCount] = useState<number>(
        oCountOverride ?? scene.o_counter ?? 0
    );
    const [oError, setOError] = useState(false);
    const [bursts, setBursts] = useState<Burst[]>([]);
    const oBusyRef = useRef(false);

    // Rating (0–100). Same lifted-override pattern as oCount — Reel
    // owns the canonical value across virtualizer mount/unmount.
    const [rating100, setRating100Local] = useState<number | null>(
        ratingOverride !== undefined ? ratingOverride : scene.rating100
    );
    useEffect(() => {
        if (ratingOverride !== undefined && ratingOverride !== rating100) {
            setRating100Local(ratingOverride);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ratingOverride]);

    // Per-collection membership map keyed by tagName. Derived from
    // (collectionsOverride ?? scene.tags + the resolved collection
    // tag-id map). The collection list itself is dynamic (the user
    // can create new ones via the SaveSheet) — we subscribe to the
    // collections module so a new collection's row appears here
    // unchecked the moment it's created.
    const [inCollections, setInCollections] = useState<
        Record<string, boolean>
    >(() => collectionsOverride ?? {});
    useEffect(() => {
        if (collectionsOverride) {
            setInCollections(collectionsOverride);
            return;
        }
        let alive = true;
        const resync = async () => {
            try {
                const [collections, tagIdMap] = await Promise.all([
                    getCollections(),
                    getCollectionTagIds(),
                ]);
                if (!alive) return;
                const result: Record<string, boolean> = {};
                for (const c of collections) {
                    const id = tagIdMap.get(c.tagName);
                    result[c.tagName] = id
                        ? scene.tags.some((t) => t.id === id)
                        : false;
                }
                setInCollections(result);
            } catch {
                /* leave previous map; user can retry */
            }
        };
        void resync();
        // Refresh when a new collection is created mid-session.
        const off = subscribeCollections(() => void resync());
        return () => {
            alive = false;
            off();
        };
    }, [collectionsOverride, scene.id, scene.tags]);

    // Multiview queue membership — read from localStorage on mount,
    // resynced via the storage event so queue changes from any tab
    // reflect in the button's filled state.
    const [inMVQueue, setInMVQueue] = useState<boolean>(() =>
        isInMultiviewQueue(scene.id)
    );
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== MULTIVIEW_STORAGE_KEY) return;
            setInMVQueue(isInMultiviewQueue(scene.id));
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [scene.id]);

    // Mutation guards — ignore concurrent taps while a request is in flight.
    const ratingBusyRef = useRef(false);
    // Per-collection busy ref so concurrent taps on the same row are
    // ignored. Keyed by tagName.
    const collectionBusyRef = useRef<Record<string, boolean>>({});

    // Attempt playback at the user's persisted mute preference, with
    // the autoplay-policy fallback. Centralised so the IO observer,
    // the tap handler, and the src-settle effect all behave the same.
    const playPreferred = (video: HTMLVideoElement) => {
        const pref = getPersistedMuted();
        video.muted = pref;
        void video
            .play()
            .then(() => {
                if (muted !== pref) setMutedSession(pref);
            })
            .catch((err: unknown) => {
                // A play() interrupted by pause()/load() (scroll-away,
                // src swap) rejects with AbortError — NOT an autoplay
                // block, so don't flip to muted or force a replay.
                if ((err as DOMException | null)?.name === "AbortError") {
                    return;
                }
                video.muted = true;
                if (!muted) setMutedSession(true);
                void video.play().catch(() => {});
            });
    };

    // Imperative <video src> management. We do this in a useEffect
    // instead of binding `src` as a React prop because:
    //   (1) we want to defer loading while the reel is mid-scroll —
    //       toggling the React `src` between a URL and undefined does
    //       NOT reliably trigger load() across browsers, so the second
    //       state where you'd expect "load now" silently stays blank.
    //   (2) we need an explicit `video.load()` call right after setting
    //       src to force the browser to actually start fetching.
    // The effect deps `[currentlyScrolling, scene.id]` mean: on mount
    // (or scene change) we assign src if scroll is settled; entering
    // scroll = no-op (existing src stays whatever it was); leaving
    // scroll = assign src on any slide that doesn't yet have it.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (currentlyScrolling) return;
        // Demo mode: no real stream — leave src unset so the gradient
        // poster shows (a data-URI can't play as <video>).
        if (readDemoMode()) return;
        const url = pickStreamUrl(scene, transcodeType);
        if (video.src !== url) {
            video.src = url;
            video.load();
        }
        // Kick playback for the active slide once src is settled. If
        // the IO fired play() mid-scroll (before src was assigned) it
        // rejected and won't re-fire, so the slide would otherwise sit
        // frozen on its poster. Guarded by isActive (off-screen slides
        // stay paused) and paused (don't double-play).
        if (isActive && video.paused) {
            playPreferred(video);
        }
    }, [currentlyScrolling, scene.id, isActive, transcodeType]);

    // Explicit decoder cleanup on unmount. The browser doesn't release
    // hardware decoder slots aggressively — they linger until GC. Calling
    // pause + removeAttribute("src") + load() forces release.
    // Empty deps: runs once on mount, cleanup fires on unmount only.
    useEffect(() => {
        const video = videoRef.current;
        return () => {
            if (!video) return;
            try {
                video.pause();
                video.removeAttribute("src");
                video.load();
            } catch {
                /* element may already be detached; ignore */
            }
        };
    }, []);

    // If the parent's override changes (e.g. another slide of the same
    // scene id mutated it — currently impossible but cheap defense), keep
    // local state in sync.
    useEffect(() => {
        if (oCountOverride !== undefined && oCountOverride !== oCount) {
            setOCount(oCountOverride);
        }
        // We deliberately don't depend on oCount — that would clobber
        // an in-flight optimistic update.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [oCountOverride]);

    // Stable ref to onOCountChange so we can call it from mutation handlers
    // without re-wiring callbacks on every parent re-render.
    const onOCountChangeRef = useRef(onOCountChange);
    useEffect(() => {
        onOCountChangeRef.current = onOCountChange;
    });
    const reportOCount = (next: number) => {
        onOCountChangeRef.current?.(scene.id, next);
    };

    const triggerLike = () => {
        // Visual burst is always immediate and independent of the mutation.
        const burstId = Date.now() + Math.floor(Math.random() * 1000);
        setBursts((prev) => [...prev, { id: burstId }]);
        window.setTimeout(() => {
            setBursts((prev) => prev.filter((b) => b.id !== burstId));
        }, BURST_LIFETIME_MS);

        if (oBusyRef.current) return;
        oBusyRef.current = true;
        setOError(false);
        // Optimistically record the scene's tags into the recency ring
        // even before the mutation succeeds — the like-burst already
        // gives the user a "you did the thing" signal and the ring is
        // cheap localStorage; rolling back on failure is fine but
        // overkill.
        recordTagInteractions(scene.tags);
        const previous = oCount;
        const optimistic = previous + 1;
        setOCount(optimistic);
        reportOCount(optimistic);
        sceneIncrementO(scene.id)
            .then((next) => {
                setOCount(next);
                reportOCount(next);
            })
            .catch((err) => {
                console.error("[binge] sceneIncrementO failed", err);
                setOCount(previous);
                reportOCount(previous);
                setOError(true);
                window.setTimeout(() => setOError(false), 1500);
            })
            .finally(() => {
                oBusyRef.current = false;
            });
    };

    const triggerUnlike = () => {
        if (oCount <= 0) return; // nothing to remove
        if (oBusyRef.current) return;
        oBusyRef.current = true;
        setOError(false);
        const previous = oCount;
        const optimistic = previous - 1;
        setOCount(optimistic);
        reportOCount(optimistic);
        sceneDecrementO(scene.id)
            .then((next) => {
                setOCount(next);
                reportOCount(next);
            })
            .catch((err) => {
                console.error("[binge] sceneDecrementO failed", err);
                setOCount(previous);
                reportOCount(previous);
                setOError(true);
                window.setTimeout(() => setOError(false), 1500);
            })
            .finally(() => {
                oBusyRef.current = false;
            });
    };

    // ── Rate ──────────────────────────────────────────────────────
    const handleSetRating = (stars: number | null) => {
        if (ratingBusyRef.current) return;
        ratingBusyRef.current = true;
        const previous = rating100;
        const next = stars === null ? null : stars * 20;
        setRating100Local(next);
        onRatingChange?.(scene.id, next);
        setSceneRating(scene.id, next)
            .then((confirmed) => {
                setRating100Local(confirmed);
                onRatingChange?.(scene.id, confirmed);
            })
            .catch(() => {
                setRating100Local(previous);
                onRatingChange?.(scene.id, previous);
            })
            .finally(() => {
                ratingBusyRef.current = false;
            });
    };

    // ── Save / collection toggle ─────────────────────────────────
    const handleToggleCollection = (tagName: string) => {
        if (collectionBusyRef.current[tagName]) return;
        collectionBusyRef.current[tagName] = true;
        const currently = inCollections[tagName] ?? false;
        const next = !currently;
        setInCollections((prev) => ({ ...prev, [tagName]: next }));
        onCollectionChange?.(scene.id, tagName, next);
        // Saving signals strong intent — feed it into the recency ring
        // so the user's favourite-collection tag preferences surface on
        // Explore as chip shortcuts. Only on saves (not removes) so
        // un-bookmarking doesn't pollute taste data.
        if (next) recordTagInteractions(scene.tags);
        setSceneInCollection(
            scene.id,
            scene.tags.map((t) => t.id),
            tagName,
            next
        )
            .then((confirmed) => {
                setInCollections((prev) => ({
                    ...prev,
                    [tagName]: confirmed,
                }));
                onCollectionChange?.(scene.id, tagName, confirmed);
            })
            .catch(() => {
                // Roll back on failure.
                setInCollections((prev) => ({
                    ...prev,
                    [tagName]: currently,
                }));
                onCollectionChange?.(scene.id, tagName, currently);
            })
            .finally(() => {
                collectionBusyRef.current[tagName] = false;
            });
    };

    // ── Multiview ────────────────────────────────────────────────
    const handleToggleMultiview = () => {
        const next = toggleMultiviewQueueScene(scene.id);
        setInMVQueue(next);
    };
    const handleOpenMultiview = () => {
        openMultiviewPlayer();
    };

    // ── Scribe ───────────────────────────────────────────────────
    // Opens binge's inline Scribe modal — same plugin backend
    // (runPluginOperation → stashScribe.py → Ollama), same storage
    // format (custom_fields.stashScribe_review + Advanced-Rating tag
    // scores), so reviews authored here roundtrip with stash-scribe.
    const scribeModal = useScribeModal();
    const handleOpenScribe = () => {
        scribeModal.openScene(scene.id);
    };

    // Single-vs-double-tap discriminator. First tap arms a 280ms timer; a
    // second tap inside that window cancels the timer and triggers the
    // like. If no second tap arrives, the timer fires and we toggle
    // play/pause.
    const tapTimerRef = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (tapTimerRef.current !== null) {
                window.clearTimeout(tapTimerRef.current);
            }
        };
    }, []);

    // Reflect muted state onto the underlying element. We cannot rely on
    // React's `muted` attribute alone — it doesn't always update post-mount.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = muted;
    }, [muted]);

    // Stable ref to onActive so the IO effect below doesn't tear down +
    // rebuild every time the parent re-creates its callback.
    const onActiveRef = useRef(onActive);
    useEffect(() => {
        onActiveRef.current = onActive;
    });

    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const active = entry.intersectionRatio >= 0.6;
                    setIsActive(active);
                    if (active) {
                        onActiveRef.current?.(scene.id);
                        // Reset to the user's persisted preference on each
                        // activation. If a prior slide had to fall back to
                        // muted, this gives us a fresh attempt to play
                        // unmuted — and once it succeeds (user gesture is
                        // typically available by slide #2), we sync the
                        // effective state back to that success.
                        playPreferred(video);
                    } else {
                        video.pause();
                    }
                }
            },
            { threshold: [0, 0.6, 1] }
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [scene.id]);

    // Track playing state for the tap indicator + accessibility
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        video.addEventListener("play", onPlay);
        video.addEventListener("pause", onPause);
        return () => {
            video.removeEventListener("play", onPlay);
            video.removeEventListener("pause", onPause);
        };
    }, []);

    const togglePlayPause = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            // Tap IS a gesture, so we can confidently try the user's
            // preference here even if a prior autoplay failed.
            playPreferred(video);
        } else {
            video.pause();
        }
    };

    const handleTap = () => {
        if (tapTimerRef.current !== null) {
            // Second tap inside the window → double-tap like.
            window.clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
            triggerLike();
            return;
        }
        tapTimerRef.current = window.setTimeout(() => {
            tapTimerRef.current = null;
            togglePlayPause();
        }, DOUBLE_TAP_WINDOW_MS);
    };

    // Title is recomputed on every render today; memoise so scrubbing
    // through neighbouring slides doesn't re-join the performer name
    // list 60 times per second.
    const displayTitle = useMemo(
        () =>
            scene.title ||
            scene.performers.map((p) => p.name).join(", ") ||
            `Scene ${scene.id}`,
        [scene.id, scene.title, scene.performers]
    );
    const detailsLine = scene.details?.trim() || "";

    // Stash's authoritative duration. Falls back to video.duration inside
    // SceneProgress when this is null.
    const stashDuration = scene.files?.[0]?.duration ?? null;

    return (
        <article
            ref={containerRef}
            className="binge-slide"
            data-scene-id={scene.id}
            data-active={isActive ? "true" : "false"}
        >
            <video
                ref={videoRef}
                className="binge-video"
                /* src managed imperatively in a useEffect above — toggling
                   via React prop doesn't reliably re-trigger load(). */
                poster={scene.paths.screenshot}
                preload={preload}
                playsInline
                /* When auto-scroll is enabled we disable loop so `ended`
                   actually fires; otherwise videos loop forever like
                   Instagram Reels and the user advances manually. */
                loop={!autoScroll}
                muted={muted}
                onEnded={() => {
                    if (!autoScroll || !isActive) return;
                    onAutoAdvance?.();
                }}
            />
            {/* Full-frame tap target. Sits above the video but below the
                overlay/action-stack so taps in the video area toggle
                play/pause while UI controls remain hot. */}
            <button
                type="button"
                className="binge-tap-target"
                onClick={handleTap}
                aria-label={isPlaying ? "Pause" : "Play"}
                tabIndex={-1}
            />
            {bursts.length > 0 && (
                <div className="binge-heart-burst-layer" aria-hidden="true">
                    {bursts.map((b) => (
                        <HeartBurst key={b.id} />
                    ))}
                </div>
            )}
            {/* Centered cluster shown only while the video is paused.
                Mute toggle (small) sits above a large play-glyph circle —
                Instagram-style. Both fade in/out together on play state. */}
            <div
                className={
                    "binge-paused-overlay" +
                    (isPlaying ? " is-hidden" : "")
                }
            >
                <MuteToggle muted={muted} onToggle={() => setMuted(!muted)} />
                <div className="binge-paused-glyph" aria-hidden="true">
                    <PlayGlyph />
                </div>
            </div>
            <div className="binge-overlay">
                <PerformerRow performers={scene.performers} />
                {scene.studio && (
                    <p className="binge-studio">{scene.studio.name}</p>
                )}
                {/* IG-style caption — single-line, tappable to open the
                    details sheet with full description + tags. */}
                <button
                    type="button"
                    className="binge-caption"
                    onClick={() => setDetailsOpen(true)}
                    aria-label="Show details"
                >
                    <span className="binge-caption-line">
                        <span className="binge-caption-title">
                            {displayTitle}
                        </span>
                        {detailsLine && (
                            <>
                                <span className="binge-caption-sep">
                                    {" — "}
                                </span>
                                <span className="binge-caption-details">
                                    {detailsLine}
                                </span>
                            </>
                        )}
                    </span>
                </button>
            </div>
            {detailsOpen && (
                <SceneDetailsSheet
                    scene={scene}
                    onClose={() => setDetailsOpen(false)}
                />
            )}
            {advancedRatingOpen && (
                <CriterionRatingModal
                    target={{ kind: "scene", id: scene.id }}
                    onClose={() => setAdvancedRatingOpen(false)}
                    onRatingChange={(r) => {
                        // Mirror the optimistic-rating channel used by
                        // the inline strip so the action-stack badge
                        // reflects the new value immediately.
                        if (onRatingChange) onRatingChange(scene.id, r);
                    }}
                />
            )}
            {moreOpen && (
                <MoreSheet
                    sceneId={scene.id}
                    onClose={() => setMoreOpen(false)}
                />
            )}
            <ActionStack
                oCount={oCount}
                oError={oError}
                onLike={triggerLike}
                onUnlike={triggerUnlike}
                ratingStars={
                    rating100 === null ? null : Math.round(rating100 / 20)
                }
                onSetRating={handleSetRating}
                onOpenAdvancedRating={() => setAdvancedRatingOpen(true)}
                inCollections={inCollections}
                onToggleCollection={handleToggleCollection}
                inMultiviewQueue={inMVQueue}
                onToggleMultiviewQueue={handleToggleMultiview}
                onOpenMultiviewPlayer={handleOpenMultiview}
                onOpenScribe={handleOpenScribe}
                onOpenMore={() => setMoreOpen(true)}
            />
            <SceneProgress videoRef={videoRef} duration={stashDuration} />
        </article>
    );
}

// Centered play glyph shown in the paused-overlay. The icon represents the
// affordance ("tap to play"), not the current state, so we only ever
// render the play arrow — when video is playing the whole overlay hides.
function PlayGlyph() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M9 7L18 12L9 17Z" />
        </svg>
    );
}
