import { useState } from "react";
import { usePerformerProfile } from "../performer/PerformerProfileContext";
import {
    PerformerHoverCard,
    type FollowState,
} from "./PerformerHoverCard";
import { FollowPerformerModal } from "./FollowPerformerModal";
import { AddSceneModal } from "./AddSceneModal";
import { SceneCardMenu } from "./SceneCardMenu";
import type { DiscoveryFeedItemWrapped } from "./useFeed";

interface DiscoveryFeedCardProps {
    item: DiscoveryFeedItemWrapped;
    onFollowed?: () => void;
}

// Feed card for a StashDB scene whose primary performer isn't in the
// user's library yet. Cover-first layout, StashDB attribution, Follow
// CTA pinned top-right of the header. Co-stars render as inline
// "@name" mentions; both the primary performer's avatar/name AND
// each co-star get an IG-style hover card on mouseover.
//
// The primary follow state is OWNED HERE and threaded into the
// hover card via `controlledFollow` so the top-right pill and the
// hover-card button stay in sync (clicking either reflects in both).
// Co-star hover cards manage their own follow state independently.
export function DiscoveryFeedCard({
    item,
    onFollowed,
}: DiscoveryFeedCardProps) {
    const { openProfile, openStashDBProfile } = usePerformerProfile();
    const [followState, setFollowState] = useState<FollowState>({
        kind: "idle",
    });
    const [modalOpen, setModalOpen] = useState(false);
    const [sceneModalOpen, setSceneModalOpen] = useState(false);
    // Once we successfully scene-create, hide the "Add to library"
    // option so a second tap doesn't fire a duplicate sceneCreate
    // (Stash rejects it with a unique-constraint error).
    const [sceneAdded, setSceneAdded] = useState(false);

    const isBusy = followState.kind === "following";
    const isFollowed = followState.kind === "followed";

    // The Follow buttons (top-right pill + hover card button) both
    // route through the modal — the modal owns the actual
    // performerCreate call. After the modal succeeds it fires
    // onCreated, which we map to the "followed" terminal state.
    const handleFollow = () => {
        if (isBusy || isFollowed) return;
        setModalOpen(true);
    };

    const handleModalCreated = () => {
        setFollowState({ kind: "followed" });
        setModalOpen(false);
        onFollowed?.();
    };

    return (
        <article className="binge-discovery-card">
            <header className="binge-discovery-card-header">
                <PerformerHoverCard
                    name={item.primaryPerformer.name}
                    image={item.primaryPerformer.image}
                    gender={item.primaryPerformer.gender}
                    birthDate={item.primaryPerformer.birthDate}
                    inLibrary={item.primaryInLibrary}
                    onOpenProfile={() =>
                        item.primaryPerformer.localId
                            ? openProfile(item.primaryPerformer.localId)
                            : openStashDBProfile(
                                  item.primaryPerformer.stashId
                              )
                    }
                    stashDBPerformerId={item.primaryPerformer.stashId}
                    stashBoxIndex={item.stashBoxIndex}
                    onFollowed={onFollowed}
                    controlledFollow={
                        item.primaryInLibrary
                            ? undefined
                            : {
                                  state: followState,
                                  onFollow: handleFollow,
                              }
                    }
                >
                    <span className="binge-discovery-card-header-target">
                        <span
                            className="binge-discovery-card-avatar"
                            style={
                                item.primaryPerformer.image
                                    ? {
                                          backgroundImage: `url(${item.primaryPerformer.image})`,
                                      }
                                    : undefined
                            }
                        >
                            {!item.primaryPerformer.image && (
                                <span className="binge-discovery-card-initial">
                                    {item.primaryPerformer.name
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>
                            )}
                        </span>
                        <span className="binge-discovery-card-header-text">
                            <span className="binge-discovery-card-name">
                                {item.primaryPerformer.name}
                            </span>
                            <span className="binge-discovery-card-sub">
                                {item.primaryInLibrary ? (
                                    <>Featured on StashDB</>
                                ) : (
                                    <>New on StashDB</>
                                )}
                                {item.releaseDate && (
                                    <> · {item.releaseDate}</>
                                )}
                            </span>
                        </span>
                    </span>
                </PerformerHoverCard>
                {!item.primaryInLibrary && (
                    <button
                        type="button"
                        className={
                            "binge-discovery-card-follow" +
                            (isFollowed ? " is-followed" : "") +
                            (followState.kind === "error"
                                ? " is-error"
                                : "")
                        }
                        onClick={handleFollow}
                        disabled={isBusy || isFollowed}
                        title={
                            isBusy
                                ? "Following…"
                                : isFollowed
                                  ? "Followed — added to your library"
                                  : `Follow ${item.primaryPerformer.name} — adds to your library`
                        }
                    >
                        {isBusy
                            ? "…"
                            : isFollowed
                              ? "Following"
                              : followState.kind === "error"
                                ? "Retry"
                                : "+ Follow"}
                    </button>
                )}
                <SceneCardMenu
                    items={
                        sceneAdded
                            ? [
                                  {
                                      label: "View on StashDB",
                                      sub: "Opens in a new tab",
                                      onClick: () =>
                                          window.open(
                                              item.stashboxUrl,
                                              "_blank",
                                              "noopener,noreferrer"
                                          ),
                                  },
                              ]
                            : [
                                  {
                                      label: "Add scene to library",
                                      sub: "Create the scene in Stash + link to StashDB",
                                      onClick: () => setSceneModalOpen(true),
                                  },
                                  {
                                      label: "View on StashDB",
                                      sub: "Opens in a new tab",
                                      onClick: () =>
                                          window.open(
                                              item.stashboxUrl,
                                              "_blank",
                                              "noopener,noreferrer"
                                          ),
                                  },
                              ]
                    }
                />
            </header>

            {item.coverUrl ? (
                <a
                    href={item.stashboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="binge-discovery-card-cover"
                    aria-label={
                        item.title
                            ? `Open "${item.title}" on StashDB`
                            : "Open scene on StashDB"
                    }
                >
                    <img
                        src={item.coverUrl}
                        alt={item.title ?? "StashDB scene"}
                        loading="lazy"
                    />
                </a>
            ) : (
                <div className="binge-discovery-card-cover binge-discovery-card-cover-empty" />
            )}

            <div className="binge-discovery-card-body">
                {item.title && (
                    <div className="binge-discovery-card-title">
                        {item.title}
                    </div>
                )}

                {item.coPerformers.length > 0 && (
                    <div className="binge-discovery-card-coperformers">
                        <span className="binge-discovery-card-with">
                            with
                        </span>
                        {item.coPerformers.map((cp, idx) => (
                            <span
                                key={cp.stashId}
                                className="binge-discovery-card-coperformer"
                            >
                                <PerformerHoverCard
                                    name={cp.name}
                                    image={cp.image}
                                    gender={cp.gender}
                                    birthDate={cp.birthDate}
                                    inLibrary={cp.localId !== null}
                                    onOpenProfile={() =>
                                        cp.localId
                                            ? openProfile(cp.localId)
                                            : openStashDBProfile(cp.stashId)
                                    }
                                    stashDBPerformerId={cp.stashId}
                                    stashBoxIndex={item.stashBoxIndex}
                                    onFollowed={onFollowed}
                                >
                                    <span className="binge-performer-mention">
                                        @{cp.name}
                                    </span>
                                </PerformerHoverCard>
                                {idx < item.coPerformers.length - 1 && (
                                    <span className="binge-discovery-card-co-sep">
                                        ,{" "}
                                    </span>
                                )}
                            </span>
                        ))}
                    </div>
                )}

                <a
                    href={item.stashboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="binge-discovery-card-stashdb-link"
                >
                    View on StashDB →
                </a>

                {followState.kind === "error" && (
                    <div className="binge-discovery-card-error">
                        {followState.message}
                    </div>
                )}
            </div>
            {modalOpen && (
                <FollowPerformerModal
                    stashDBPerformerId={item.primaryPerformer.stashId}
                    stashBoxIndex={item.stashBoxIndex}
                    fallbackName={item.primaryPerformer.name}
                    fallbackImage={item.primaryPerformer.image}
                    stashboxUrl={item.stashboxUrl}
                    onCreated={handleModalCreated}
                    onClose={() => setModalOpen(false)}
                />
            )}
            {sceneModalOpen && (
                <AddSceneModal
                    stashDBSceneId={item.sceneStashId}
                    fallbackTitle={item.title}
                    fallbackCover={item.coverUrl}
                    stashboxUrl={item.stashboxUrl}
                    onCreated={() => {
                        setSceneAdded(true);
                        setSceneModalOpen(false);
                        onFollowed?.();
                    }}
                    onClose={() => setSceneModalOpen(false)}
                />
            )}
        </article>
    );
}
