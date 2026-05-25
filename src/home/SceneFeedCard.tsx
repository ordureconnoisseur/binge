import { useEffect, useRef, useState } from "react";
import { SceneCardMenu } from "./SceneCardMenu";
import { PerformerHoverCard } from "./PerformerHoverCard";
import type { FeedPerformer, FeedTag, SceneFeedItem } from "./useFeed";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "../tabs/TabContext";
import { usePerformerProfile } from "../performer/PerformerProfileContext";
import { useMuteState } from "../hooks/useMuteState";
import { sceneIncrementO } from "../api/mutations";
import { recordTagInteractions } from "../api/interactedTags";
import {
    useHasAdvancedRating,
    useHasMultiview,
    useHasScribe,
} from "../plugins/PluginContext";
import {
    isInMultiviewQueue,
    toggleMultiviewQueueScene,
    MULTIVIEW_STORAGE_KEY,
} from "../api/multiview";
import {
    GridIcon,
    PencilIcon,
    StarIcon,
    BookmarkIcon,
} from "../components/ActionStack";
import { CriterionRatingModal } from "../components/CriterionRatingModal";
import { MutedIcon, UnmutedIcon } from "../components/MuteToggle";
import { SaveSheet } from "../components/SaveSheet";
import {
    getCollectionTagIds,
    getCollections,
    setSceneInCollection,
    subscribeCollections,
} from "../api/collections";
import { timeAgo } from "./timeAgo";
import { useScribeModal } from "../scribe/ScribeContext";

interface SceneFeedCardProps {
    item: SceneFeedItem;
}

// Scene-as-post IG-style card. Preview WebM auto-plays muted when ≥60%
// in view (IntersectionObserver, same threshold the Reel uses). Click
// the media to toggle play/pause; double-click to like; tap the header
// avatar/name to open that performer's profile.
//
// The CTA "Watch full scene →" is the primary navigation off this card
// — it drops into the existing reel flow (filter to performer + pin
// this scene at slot 0).
export function SceneFeedCard({ item }: SceneFeedCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [muted, setMuted] = useMuteState();
    const [oCount, setOCount] = useState(0);
    const [liked, setLiked] = useState(false);
    const oBusyRef = useRef(false);

    const { replace } = useFilter();
    const { setTab, setPinFirstSceneId, setReelMode } = useTab();
    const { openProfile } = usePerformerProfile();

    const hasAdvancedRating = useHasAdvancedRating();
    const hasMultiview = useHasMultiview();
    const hasScribe = useHasScribe();

    const [ratingOpen, setRatingOpen] = useState(false);
    const [saveSheetOpen, setSaveSheetOpen] = useState(false);
    const [inMVQueue, setInMVQueue] = useState(false);
    const [inCollections, setInCollections] = useState<Record<string, boolean>>({});

    // Multiview queue membership — same cross-tab sync as SceneSlide.
    useEffect(() => {
        const refresh = () => setInMVQueue(isInMultiviewQueue(item.sceneId));
        refresh();
        const onStorage = (e: StorageEvent) => {
            if (e.key === MULTIVIEW_STORAGE_KEY) refresh();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [item.sceneId]);

    // Per-collection membership for the bookmark fill state. Mirrors
    // SceneSlide's pattern: cross-reference each collection's tag id
    // against the scene's tags.
    useEffect(() => {
        let alive = true;
        const refresh = async () => {
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
                        ? item.tags.some((t) => t.id === id)
                        : false;
                }
                setInCollections(result);
            } catch {
                /* leave previous map */
            }
        };
        void refresh();
        const unsub = subscribeCollections(() => void refresh());
        return () => {
            alive = false;
            unsub();
        };
    }, [item.sceneId, item.tags]);

    const savedSomewhere = Object.values(inCollections).some(Boolean);
    const handleToggleMV = () => {
        setInMVQueue(toggleMultiviewQueueScene(item.sceneId));
    };
    const scribeModal = useScribeModal();
    const handleOpenScribe = () => {
        scribeModal.openScene(item.sceneId);
    };
    const handleToggleCollection = async (tagName: string) => {
        const next = !inCollections[tagName];
        setInCollections((m) => ({ ...m, [tagName]: next }));
        // Same intent signal as the reel: saving = strong taste data.
        if (next) recordTagInteractions(item.tags);
        try {
            const confirmed = await setSceneInCollection(
                item.sceneId,
                item.tags.map((t) => t.id),
                tagName,
                next
            );
            setInCollections((m) => ({ ...m, [tagName]: confirmed }));
        } catch {
            // Revert on error.
            setInCollections((m) => ({ ...m, [tagName]: !next }));
        }
    };

    const isPortrait =
        item.width !== null &&
        item.height !== null &&
        item.height > item.width;
    const primaryPerformer = item.performers[0];

    // Auto-play when scrolled into view. Mirrors SceneSlide's IO logic
    // but drops the muted-fallback dance — feed previews are always
    // muted by default, the user has to click the card to unmute.
    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const active = entry.intersectionRatio >= 0.6;
                    if (active) {
                        video.muted = muted;
                        void video.play().catch(() => {
                            // Retry muted, accept failure silently.
                            video.muted = true;
                            void video.play().catch(() => {});
                        });
                    } else {
                        video.pause();
                    }
                }
            },
            { threshold: [0, 0.6, 1] }
        );
        observer.observe(container);
        return () => observer.disconnect();
        // muted intentionally not a dep — IO callback reads the latest
        // value from closure; if we depend on it the observer
        // tears down on every mute toggle.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Track play state for the centred play-glyph overlay.
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
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
    };

    const triggerLike = () => {
        if (oBusyRef.current) return;
        oBusyRef.current = true;
        // Push this scene's tags into Explore's recency ring — likes
        // are the strongest cheap-to-emit signal of taste.
        recordTagInteractions(item.tags);
        const prev = oCount;
        setOCount(prev + 1);
        setLiked(true);
        sceneIncrementO(item.sceneId)
            .then((next) => setOCount(next))
            .catch(() => {
                setOCount(prev);
                setLiked(prev > 0);
            })
            .finally(() => {
                oBusyRef.current = false;
            });
    };

    // Single-vs-double tap discriminator. First tap arms a 250ms timer;
    // a second tap inside the window cancels the timer and triggers a
    // like. If the timer fires, it toggles play/pause.
    const tapTimerRef = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (tapTimerRef.current !== null)
                window.clearTimeout(tapTimerRef.current);
        };
    }, []);
    const handleTap = () => {
        if (tapTimerRef.current !== null) {
            window.clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
            triggerLike();
            return;
        }
        tapTimerRef.current = window.setTimeout(() => {
            tapTimerRef.current = null;
            togglePlayPause();
        }, 250);
    };

    const handleWatchFullScene = () => {
        if (!primaryPerformer) return;
        // Feed CTA is a deterministic filter-driven entry — explicitly
        // not chained. Reset in case the user was previously in
        // chained mode via Explore.
        setReelMode("random");
        replace({
            performers: [
                {
                    id: primaryPerformer.id,
                    name: primaryPerformer.name,
                    image_path: primaryPerformer.imagePath,
                },
            ],
            tags: [],
            studios: [],
        });
        setPinFirstSceneId(item.sceneId);
        setTab("foryou");
    };

    return (
        <article className="binge-feed-card" ref={containerRef}>
            <header className="binge-feed-card-header">
                <div className="binge-feed-card-author">
                    <AvatarStack
                        performers={item.performers}
                        onClick={(id) => openProfile(id)}
                    />
                    {primaryPerformer ? (
                        <PerformerHoverCard
                            name={primaryPerformer.name}
                            image={primaryPerformer.imagePath}
                            gender={null}
                            birthDate={null}
                            inLibrary
                            onOpenProfile={() =>
                                openProfile(primaryPerformer.id)
                            }
                        >
                            <button
                                type="button"
                                className="binge-feed-card-name-btn"
                                onClick={(e) => {
                                    // Don't let the outer hover-card
                                    // wrapper also receive the click
                                    // (it would toggle the popover
                                    // open while we're navigating
                                    // away to the profile).
                                    e.stopPropagation();
                                    openProfile(primaryPerformer.id);
                                }}
                                aria-label={primaryPerformer.name}
                            >
                                <span className="binge-feed-card-name">
                                    {item.performers
                                        .map((p) => p.name)
                                        .join(", ") || "Unknown"}
                                </span>
                            </button>
                        </PerformerHoverCard>
                    ) : (
                        <span className="binge-feed-card-name">
                            Unknown
                        </span>
                    )}
                </div>
                <span className="binge-feed-card-time">
                    {timeAgo(item.effectiveAt)}
                </span>
                <SceneCardMenu
                    items={[
                        {
                            label: "Open in Stash",
                            sub: "Opens the scene in your Stash UI",
                            onClick: () =>
                                window.open(
                                    `/scenes/${item.sceneId}`,
                                    "_blank",
                                    "noopener,noreferrer"
                                ),
                        },
                    ]}
                />
            </header>

            <div
                className={
                    "binge-feed-card-media" +
                    (isPortrait ? " is-portrait" : " is-landscape")
                }
            >
                <video
                    ref={videoRef}
                    className={
                        "binge-feed-card-video" +
                        (isPortrait ? " is-portrait" : "")
                    }
                    src={item.preview ?? undefined}
                    poster={item.screenshot ?? undefined}
                    playsInline
                    loop
                    muted={muted}
                />
                <button
                    type="button"
                    className="binge-feed-card-tap"
                    onClick={handleTap}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    tabIndex={-1}
                />
                {!isPlaying && (
                    <div
                        className="binge-feed-card-play-glyph"
                        aria-hidden="true"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M9 7L18 12L9 17Z" />
                        </svg>
                    </div>
                )}
                <button
                    type="button"
                    className="binge-feed-card-mute"
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

            <div className="binge-feed-card-actions">
                <button
                    type="button"
                    className={
                        "binge-feed-card-like" +
                        (liked || oCount > 0 ? " is-liked" : "")
                    }
                    onClick={triggerLike}
                    aria-label="Like"
                    title="Like"
                >
                    <HeartIcon filled={liked || oCount > 0} />
                    {oCount > 0 && (
                        <span className="binge-feed-card-like-count">
                            {oCount}
                        </span>
                    )}
                </button>
                {hasAdvancedRating && (
                    <button
                        type="button"
                        className="binge-feed-card-iconbtn"
                        onClick={() => setRatingOpen(true)}
                        aria-label="Rate"
                        title="Rate (advanced)"
                    >
                        <StarIcon filled={false} />
                    </button>
                )}
                {hasMultiview && (
                    <button
                        type="button"
                        className={
                            "binge-feed-card-iconbtn" +
                            (inMVQueue ? " is-active" : "")
                        }
                        onClick={handleToggleMV}
                        aria-label={
                            inMVQueue
                                ? "Remove from Multiview"
                                : "Add to Multiview"
                        }
                        title="Send to Multiview"
                    >
                        <GridIcon filled={inMVQueue} />
                    </button>
                )}
                {hasScribe && (
                    <button
                        type="button"
                        className="binge-feed-card-iconbtn"
                        onClick={handleOpenScribe}
                        aria-label="Write review with Scribe"
                        title="Write review"
                    >
                        <PencilIcon />
                    </button>
                )}
                <button
                    type="button"
                    className={
                        "binge-feed-card-iconbtn" +
                        (savedSomewhere ? " is-active" : "")
                    }
                    onClick={() => setSaveSheetOpen(true)}
                    aria-label="Save"
                    title="Save"
                >
                    <BookmarkIcon filled={savedSomewhere} />
                </button>
                <button
                    type="button"
                    className="binge-feed-card-cta"
                    onClick={handleWatchFullScene}
                >
                    Watch full scene →
                </button>
            </div>

            {ratingOpen && (
                <CriterionRatingModal
                    target={{ kind: "scene", id: item.sceneId }}
                    onClose={() => setRatingOpen(false)}
                />
            )}
            {saveSheetOpen && (
                <SaveSheet
                    inCollections={inCollections}
                    onToggle={handleToggleCollection}
                    onClose={() => setSaveSheetOpen(false)}
                />
            )}

            {(item.title || item.details) && (
                <FeedCaption title={item.title} details={item.details} />
            )}

            {item.tags.length > 0 && (
                <HashtagRow
                    tags={item.tags}
                    onTap={(tag) => {
                        // Hashtag taps are deterministic filter-driven —
                        // not chained. Defensively reset reelMode.
                        setReelMode("random");
                        replace({
                            performers: [],
                            tags: [{ id: tag.id, name: tag.name }],
                            studios: [],
                        });
                        setTab("foryou");
                    }}
                />
            )}
        </article>
    );
}

// IG-style caption: bold title acts as the lead-in, with an inline
// "…more" button when the scene has a `details` field. Tapping more
// expands the details paragraph below; tapping "less" collapses.
function FeedCaption({
    title,
    details,
}: {
    title: string | null;
    details: string | null;
}) {
    const [expanded, setExpanded] = useState(false);
    const trimmedDetails = details?.trim() || "";
    const hasDetails = trimmedDetails.length > 0;
    return (
        <div className="binge-feed-card-caption">
            <div className="binge-feed-card-caption-line">
                {title && (
                    <span className="binge-feed-card-title">{title}</span>
                )}
                {hasDetails && !expanded && (
                    <>
                        {title && (
                            <span className="binge-feed-card-caption-dim">
                                {" "}
                                …{" "}
                            </span>
                        )}
                        <button
                            type="button"
                            className="binge-feed-card-more-btn"
                            onClick={() => setExpanded(true)}
                        >
                            more
                        </button>
                    </>
                )}
            </div>
            {hasDetails && expanded && (
                <div className="binge-feed-card-details">
                    {trimmedDetails}{" "}
                    <button
                        type="button"
                        className="binge-feed-card-more-btn"
                        onClick={() => setExpanded(false)}
                    >
                        less
                    </button>
                </div>
            )}
        </div>
    );
}

// Stacked-circle avatar row. Each avatar gets wrapped in a
// PerformerHoverCard so hovering it shows the same IG-style mini
// profile that DiscoveryFeedCard's co-stars expose. Library
// performers naturally show "In library" + "Open profile" inside
// the card. Click on the avatar still routes straight to the
// profile (we stopPropagation so the card-toggle handler at the
// wrapper level doesn't also fire).
function AvatarStack({
    performers,
    onClick,
}: {
    performers: FeedPerformer[];
    onClick: (performerId: string) => void;
}) {
    if (performers.length === 0) return null;
    const visible = performers.slice(0, 3);
    const overflow = performers.length - visible.length;
    return (
        <div className="binge-feed-card-avatar-stack">
            {visible.map((p, i) => (
                <PerformerHoverCard
                    key={p.id}
                    name={p.name}
                    image={p.imagePath}
                    gender={null}
                    birthDate={null}
                    inLibrary
                    onOpenProfile={() => onClick(p.id)}
                >
                    <span
                        className="binge-feed-card-stack-avatar"
                        style={{
                            zIndex: visible.length - i,
                            position: "relative",
                            ...(p.imagePath
                                ? { backgroundImage: `url(${p.imagePath})` }
                                : {}),
                        }}
                        title={p.name}
                        aria-label={p.name}
                    >
                        {!p.imagePath && (
                            <span className="binge-feed-card-stack-initial">
                                {p.name.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </span>
                </PerformerHoverCard>
            ))}
            {overflow > 0 && (
                <span
                    className="binge-feed-card-stack-avatar binge-feed-card-stack-overflow"
                    aria-hidden="true"
                >
                    +{overflow}
                </span>
            )}
        </div>
    );
}

// IG-style hashtag row. Shows first 7 tags; "+N more" expands the rest
// inline. Each tag tap filters the For You reel to that tag.
function HashtagRow({
    tags,
    onTap,
}: {
    tags: FeedTag[];
    onTap: (tag: FeedTag) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const INITIAL = 7;
    const shown = expanded ? tags : tags.slice(0, INITIAL);
    const hidden = tags.length - shown.length;
    return (
        <div className="binge-feed-card-hashtags">
            {shown.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    className="binge-feed-card-hashtag"
                    onClick={() => onTap(t)}
                >
                    #{t.name}
                </button>
            ))}
            {hidden > 0 && (
                <button
                    type="button"
                    className="binge-feed-card-hashtag-more"
                    onClick={() => setExpanded(true)}
                    aria-label={`Show ${hidden} more tag${
                        hidden === 1 ? "" : "s"
                    }`}
                >
                    +{hidden} more
                </button>
            )}
            {expanded && tags.length > INITIAL && (
                <button
                    type="button"
                    className="binge-feed-card-hashtag-more"
                    onClick={() => setExpanded(false)}
                    aria-label="Show fewer tags"
                >
                    less
                </button>
            )}
        </div>
    );
}

function HeartIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="1.4em"
            height="1.4em"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={filled ? 1 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    );
}
