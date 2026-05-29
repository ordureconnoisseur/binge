import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FollowPerformerModal } from "./FollowPerformerModal";
import { VerifiedIcon } from "../performer/PerformerProfile";

export type FollowState =
    | { kind: "idle" }
    | { kind: "following" }
    | { kind: "followed" }
    | { kind: "error"; message: string };

interface PerformerHoverCardProps {
    name: string;
    image: string | null;
    gender: string | null;
    birthDate: string | null; // YYYY-MM-DD
    // True when the performer exists in the user's local Stash
    // library; controls the "In library" badge and which action
    // button the card renders.
    inLibrary: boolean;
    // Whether the library performer is marked Favourite — drives
    // the inline verified-mark colour (pink = favourite, blue =
    // library only). Ignored when inLibrary is false. Defaults to
    // false when omitted (caller may not have the info to hand,
    // e.g. discovery cards that build from StashDB data).
    favorite?: boolean;

    // For library performers — opens the binge performer profile.
    onOpenProfile?: () => void;

    // For non-library performers — calls performerCreate + auto-
    // scrape under the hood. Required when inLibrary is false.
    stashDBPerformerId?: string;
    stashBoxIndex?: number;
    onFollowed?: () => void;

    // Controlled follow state — when provided, the hover card
    // mirrors this instead of managing its own. Useful when there's
    // a SECOND Follow control on the same performer elsewhere on
    // the page (the top-right pill on DiscoveryFeedCard's header)
    // — wiring both to the same external state keeps them in sync.
    controlledFollow?: {
        state: FollowState;
        onFollow: () => void;
    };

    // The trigger element to anchor the hover card to. Whatever you
    // pass is rendered inside a wrapper span that owns the hover +
    // click handlers — so a styled `@name` mention or an avatar +
    // name combo both work.
    children: ReactNode;
}

const SHOW_DELAY_MS = 220;
const HIDE_DELAY_MS = 160;

export function PerformerHoverCard({
    name,
    image,
    gender,
    birthDate,
    inLibrary,
    favorite = false,
    onOpenProfile,
    stashDBPerformerId,
    stashBoxIndex,
    onFollowed,
    controlledFollow,
    children,
}: PerformerHoverCardProps) {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(
        null
    );
    const showTimerRef = useRef<number | null>(null);
    const hideTimerRef = useRef<number | null>(null);

    // Internal follow state — used when controlledFollow isn't
    // passed. The primary performer on a DiscoveryFeedCard passes
    // controlledFollow so it stays in sync with the top-right
    // pill; co-performers don't (they own their state alone).
    const [internalFollow, setInternalFollow] = useState<FollowState>({
        kind: "idle",
    });
    const followState = controlledFollow?.state ?? internalFollow;
    const [modalOpen, setModalOpen] = useState(false);

    // Tap Follow → open the confirm modal. The modal owns the
    // actual performerCreate call so the user can edit the scraped
    // metadata before committing. After the modal succeeds we flip
    // internal state to "followed" (controlledFollow mode owns
    // its own state externally).
    const doFollow = () => {
        if (controlledFollow) {
            controlledFollow.onFollow();
            return;
        }
        if (!stashDBPerformerId || stashBoxIndex === undefined) return;
        if (followState.kind === "following") return;
        setModalOpen(true);
    };

    const handleModalCreated = () => {
        setInternalFollow({ kind: "followed" });
        setModalOpen(false);
        onFollowed?.();
    };

    useEffect(() => {
        return () => {
            if (showTimerRef.current)
                window.clearTimeout(showTimerRef.current);
            if (hideTimerRef.current)
                window.clearTimeout(hideTimerRef.current);
        };
    }, []);

    // Reposition when open (and on scroll/resize). Anchor BELOW
    // the trigger by default; flip ABOVE when there isn't enough
    // viewport space below (avoids the card running off-screen
    // when the trigger is near the bottom of the viewport — common
    // for performer mentions in the body of feed cards).
    const [placement, setPlacement] = useState<"below" | "above">(
        "below"
    );
    useEffect(() => {
        if (!open) return;
        const update = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const cardWidth = cardRef.current?.offsetWidth ?? 280;
            const cardHeight = cardRef.current?.offsetHeight ?? 180;
            const margin = 8;
            const desiredLeft = rect.left + rect.width / 2 - cardWidth / 2;
            const clampedLeft = Math.max(
                margin,
                Math.min(desiredLeft, window.innerWidth - cardWidth - margin)
            );
            const spaceBelow = window.innerHeight - rect.bottom;
            const placeAbove =
                spaceBelow < cardHeight + 20 && rect.top > cardHeight + 20;
            setPlacement(placeAbove ? "above" : "below");
            setPos({
                top: placeAbove
                    ? rect.top + window.scrollY - 10
                    : rect.bottom + window.scrollY + 10,
                left: clampedLeft + window.scrollX,
            });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open]);

    // Click-outside to dismiss (touch + desktop).
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            if (
                cardRef.current?.contains(target) ||
                triggerRef.current?.contains(target)
            ) {
                return;
            }
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("touchstart", onDown, { passive: true });
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("touchstart", onDown);
        };
    }, [open]);

    const cancelTimers = () => {
        if (showTimerRef.current) {
            window.clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
        if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    };
    const queueShow = () => {
        cancelTimers();
        showTimerRef.current = window.setTimeout(
            () => setOpen(true),
            SHOW_DELAY_MS
        );
    };
    const queueHide = () => {
        cancelTimers();
        hideTimerRef.current = window.setTimeout(
            () => setOpen(false),
            HIDE_DELAY_MS
        );
    };

    const age =
        birthDate && /^\d{4}-\d{2}-\d{2}/.test(birthDate)
            ? computeAge(birthDate)
            : null;

    const followBusy = followState.kind === "following";
    const followedAlready = followState.kind === "followed";
    const followError =
        followState.kind === "error" ? followState.message : null;
    const followLabel = followBusy
        ? "Following…"
        : followedAlready
          ? "Following"
          : followError
            ? `Retry · Follow ${name}`
            : `Follow ${name}`;

    return (
        <>
            <span
                ref={triggerRef}
                className="binge-hovercard-trigger"
                onMouseEnter={queueShow}
                onMouseLeave={queueHide}
                onClick={() => {
                    cancelTimers();
                    setOpen((v) => !v);
                }}
            >
                {children}
            </span>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={cardRef}
                        className="binge-performer-hovercard"
                        style={{
                            top: pos.top,
                            left: pos.left,
                            // "below" leaves the top edge anchored
                            // at trigger.bottom + 10px (no transform).
                            // "above" pins the bottom of the card
                            // 10px above the trigger via -100% Y
                            // (cards's own height shifts it up).
                            transform:
                                placement === "above"
                                    ? "translateY(-100%)"
                                    : undefined,
                        }}
                        onMouseEnter={cancelTimers}
                        onMouseLeave={queueHide}
                    >
                        <div className="binge-performer-hovercard-row">
                            <span
                                className="binge-performer-hovercard-img"
                                style={
                                    image
                                        ? {
                                              backgroundImage: `url(${image})`,
                                          }
                                        : undefined
                                }
                            >
                                {!image && (
                                    <span className="binge-performer-hovercard-initial">
                                        {name.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </span>
                            <div className="binge-performer-hovercard-text">
                                <span className="binge-performer-hovercard-name">
                                    {name}
                                    {inLibrary && (
                                        <span
                                            className={
                                                "binge-feed-card-verified" +
                                                (favorite
                                                    ? " is-favorite"
                                                    : "")
                                            }
                                            aria-label={
                                                favorite
                                                    ? "Favourited"
                                                    : "In library"
                                            }
                                            title={
                                                favorite
                                                    ? "Favourited"
                                                    : "In library"
                                            }
                                        >
                                            <VerifiedIcon />
                                        </span>
                                    )}
                                </span>
                                <span className="binge-performer-hovercard-meta">
                                    {[
                                        formatGender(gender),
                                        age !== null ? `${age}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") || "Performer"}
                                </span>
                                <span
                                    className={
                                        "binge-performer-hovercard-pill" +
                                        (inLibrary
                                            ? " is-library"
                                            : " is-stashdb")
                                    }
                                >
                                    {inLibrary ? "In library" : "StashDB"}
                                </span>
                            </div>
                        </div>
                        {onOpenProfile && (
                            <button
                                type="button"
                                className="binge-performer-hovercard-open"
                                onClick={() => {
                                    onOpenProfile();
                                    setOpen(false);
                                }}
                            >
                                Open profile
                            </button>
                        )}
                        {!inLibrary && (
                            <>
                                <button
                                    type="button"
                                    className={
                                        "binge-performer-hovercard-follow" +
                                        (followedAlready
                                            ? " is-followed"
                                            : "") +
                                        (followError ? " is-error" : "")
                                    }
                                    onClick={doFollow}
                                    disabled={followBusy || followedAlready}
                                >
                                    {followLabel}
                                </button>
                                {followError && (
                                    <div className="binge-performer-hovercard-error">
                                        {followError}
                                    </div>
                                )}
                            </>
                        )}
                    </div>,
                    document.body
                )}
            {modalOpen && stashDBPerformerId && stashBoxIndex !== undefined && (
                <FollowPerformerModal
                    stashDBPerformerId={stashDBPerformerId}
                    stashBoxIndex={stashBoxIndex}
                    fallbackName={name}
                    fallbackImage={image}
                    onCreated={handleModalCreated}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </>
    );
}

function computeAge(birthDate: string): number {
    const [y, m, d] = birthDate
        .slice(0, 10)
        .split("-")
        .map((n) => parseInt(n, 10));
    if (!y || !m || !d) return 0;
    const now = new Date();
    let age = now.getFullYear() - y;
    const beforeBirthday =
        now.getMonth() + 1 < m ||
        (now.getMonth() + 1 === m && now.getDate() < d);
    if (beforeBirthday) age -= 1;
    return age;
}

function formatGender(g: string | null): string | null {
    if (!g) return null;
    switch (g) {
        case "FEMALE":
            return "Female";
        case "TRANSGENDER_FEMALE":
            return "Trans female";
        case "MALE":
            return "Male";
        case "TRANSGENDER_MALE":
            return "Trans male";
        case "INTERSEX":
            return "Intersex";
        case "NON_BINARY":
            return "Non-binary";
        default:
            return g
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/^./, (c) => c.toUpperCase());
    }
}
