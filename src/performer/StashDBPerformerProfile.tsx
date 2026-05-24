import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    getStashDBBox,
    getOwnedStashDBSceneIds,
    getStashDBPerformer,
    getStashDBScenesForPerformer,
    type StashDBPerformerDetail,
    type StashDBScene,
} from "../api/stashdb";
import { usePerformerProfile } from "./PerformerProfileContext";
import { FollowPerformerModal } from "../home/FollowPerformerModal";
import { AddSceneModal } from "../home/AddSceneModal";
import { PerformerLinks } from "./PerformerLinks";

// Profile page for a StashDB performer the user hasn't added to their
// library yet. **Reuses the exact same class names and layout** as
// LocalPerformerProfile so the two pages feel like the same surface
// with different data sources. Differences from local:
//   - Stats row has "scenes / in library / aliases" instead of
//     scenes/o/galleries (StashDB doesn't track o/galleries)
//   - Name link opens StashDB (not Stash)
//   - Follow button creates a local performer via FollowPerformerModal
//   - Scene tiles open AddSceneModal instead of dropping into the reel
//   - "StashDB" pill replaces the Favourited verified-tick

type State =
    | { kind: "loading" }
    | {
          kind: "ready";
          performer: StashDBPerformerDetail;
          scenes: StashDBScene[];
          ownedSceneIds: Set<string>;
          stashBoxIndex: number;
      }
    | { kind: "error"; message: string };

export function StashDBPerformerProfile({
    stashDBPerformerId,
}: {
    stashDBPerformerId: string;
}) {
    const { close } = usePerformerProfile();
    const [state, setState] = useState<State>({ kind: "loading" });
    const [followOpen, setFollowOpen] = useState(false);
    const [followed, setFollowed] = useState(false);
    const [sceneModalFor, setSceneModalFor] = useState<{
        sceneId: string;
        title: string | null;
        cover: string | null;
        stashboxUrl: string;
    } | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        let alive = true;
        setState({ kind: "loading" });
        (async () => {
            try {
                const box = await getStashDBBox();
                if (!box) {
                    throw new Error(
                        "StashDB isn't configured in Stash → Settings → Metadata Providers."
                    );
                }
                const [performer, scenes, ownedSceneIds] = await Promise.all([
                    getStashDBPerformer(stashDBPerformerId, box.api_key),
                    getStashDBScenesForPerformer(
                        stashDBPerformerId,
                        box.api_key
                    ),
                    getOwnedStashDBSceneIds(),
                ]);
                if (!alive) return;
                if (!performer) {
                    throw new Error("Performer not found on StashDB.");
                }
                setState({
                    kind: "ready",
                    performer,
                    scenes,
                    ownedSceneIds,
                    stashBoxIndex: box.index,
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
    }, [stashDBPerformerId]);

    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const handler = () => setScrolled(el.scrollTop > 12);
        handler();
        el.addEventListener("scroll", handler, { passive: true });
        return () => el.removeEventListener("scroll", handler);
    }, [state.kind]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [close]);

    return createPortal(
        <div
            className="binge-profile-root"
            role="dialog"
            aria-label="StashDB performer profile"
        >
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
                    <span
                        className="binge-profile-stashdb-pill"
                        aria-label="StashDB"
                        title="StashDB"
                    >
                        StashDB
                    </span>
                </span>
                <span className="binge-profile-more" aria-hidden="true" />
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
                            <span
                                className="binge-profile-avatar"
                                style={
                                    state.performer.images[0]?.url
                                        ? {
                                              backgroundImage: `url(${state.performer.images[0].url})`,
                                          }
                                        : undefined
                                }
                            >
                                {!state.performer.images[0]?.url && (
                                    <span className="binge-profile-avatar-initial">
                                        {state.performer.name
                                            .charAt(0)
                                            .toUpperCase()}
                                    </span>
                                )}
                            </span>
                            <ul className="binge-profile-stats">
                                <Stat
                                    value={state.performer.sceneCount}
                                    label="scenes"
                                />
                                <Stat
                                    value={countOwned(
                                        state.scenes,
                                        state.ownedSceneIds
                                    )}
                                    label="in library"
                                />
                                <Stat
                                    value={state.performer.aliases.length}
                                    label="aliases"
                                />
                            </ul>
                        </section>

                        <section className="binge-profile-bio">
                            <div className="binge-profile-name-row">
                                <h1 className="binge-profile-name">
                                    <a
                                        href={`https://stashdb.org/performers/${state.performer.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="binge-profile-name-link"
                                        title="Open on StashDB"
                                    >
                                        {state.performer.name}
                                    </a>
                                </h1>
                            </div>
                            {state.performer.aliases.length > 0 && (
                                <p className="binge-profile-aliases">
                                    a.k.a.{" "}
                                    {state.performer.aliases.join(", ")}
                                </p>
                            )}
                            <BioAttrs performer={state.performer} />
                            <PerformerLinks
                                urls={state.performer.urls.map((u) => u.url)}
                            />
                        </section>

                        <div className="binge-profile-actions">
                            <button
                                type="button"
                                className={
                                    "binge-follow-btn binge-profile-follow" +
                                    (followed ? " is-following" : "")
                                }
                                onClick={() =>
                                    !followed && setFollowOpen(true)
                                }
                                disabled={followed}
                                aria-pressed={followed}
                            >
                                {followed ? "Following" : "+ Follow"}
                            </button>
                        </div>

                        <section className="binge-profile-scenes">
                            <h2 className="binge-profile-scenes-heading">
                                Scenes ({state.scenes.length})
                            </h2>
                            {state.scenes.length === 0 ? (
                                <div className="binge-status">no scenes</div>
                            ) : (
                                <ul className="binge-profile-scene-grid">
                                    {state.scenes.map((s) => (
                                        <StashDBSceneTile
                                            key={s.id}
                                            scene={s}
                                            owned={state.ownedSceneIds.has(
                                                s.id
                                            )}
                                            onOpenAddModal={() =>
                                                setSceneModalFor({
                                                    sceneId: s.id,
                                                    title: s.title,
                                                    cover: s.coverUrl,
                                                    stashboxUrl: `https://stashdb.org/scenes/${s.id}`,
                                                })
                                            }
                                        />
                                    ))}
                                </ul>
                            )}
                        </section>
                    </>
                )}
            </div>

            {followOpen && state.kind === "ready" && (
                <FollowPerformerModal
                    stashDBPerformerId={state.performer.id}
                    stashBoxIndex={state.stashBoxIndex}
                    fallbackName={state.performer.name}
                    fallbackImage={state.performer.images[0]?.url ?? null}
                    stashboxUrl={`https://stashdb.org/performers/${state.performer.id}`}
                    onCreated={() => {
                        setFollowed(true);
                        setFollowOpen(false);
                    }}
                    onClose={() => setFollowOpen(false)}
                />
            )}
            {sceneModalFor && state.kind === "ready" && (
                <AddSceneModal
                    stashDBSceneId={sceneModalFor.sceneId}
                    fallbackTitle={sceneModalFor.title}
                    fallbackCover={sceneModalFor.cover}
                    stashboxUrl={sceneModalFor.stashboxUrl}
                    onCreated={() => {
                        setSceneModalFor(null);
                        getOwnedStashDBSceneIds().then((ids) => {
                            setState((prev) =>
                                prev.kind === "ready"
                                    ? { ...prev, ownedSceneIds: ids }
                                    : prev
                            );
                        });
                    }}
                    onClose={() => setSceneModalFor(null)}
                />
            )}
        </div>,
        document.body
    );
}

function Stat({
    value,
    label,
}: {
    value: number | null;
    label: string;
}) {
    return (
        <li className="binge-profile-stat">
            <span className="binge-profile-stat-value">
                {value == null ? "—" : compact(value)}
            </span>
            <span className="binge-profile-stat-label">{label}</span>
        </li>
    );
}

function compact(n: number): string {
    if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 1_000)
        return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    return String(n);
}

function BioAttrs({
    performer,
}: {
    performer: StashDBPerformerDetail;
}) {
    const attrs: string[] = [];
    if (performer.country) attrs.push(performer.country);
    const birthYear = performer.birthDate
        ? parseBirthYear(performer.birthDate)
        : null;
    if (birthYear) attrs.push(String(birthYear));
    if (performer.hairColor) {
        attrs.push(performer.hairColor.toLowerCase());
    }
    if (performer.eyeColor) {
        attrs.push(`${performer.eyeColor.toLowerCase()} eyes`);
    }
    if (performer.gender) attrs.push(genderLabel(performer.gender));
    if (performer.height) attrs.push(`${performer.height} cm`);
    if (performer.measurements) attrs.push(performer.measurements);
    if (attrs.length === 0) return null;
    return <p className="binge-profile-attrs">{attrs.join(" · ")}</p>;
}

function parseBirthYear(birthDate: string): number | null {
    const m = birthDate.match(/^(\d{4})/);
    return m ? Number(m[1]) : null;
}

function genderLabel(g: string): string {
    switch (g) {
        case "FEMALE":
            return "female";
        case "TRANSGENDER_FEMALE":
            return "trans female";
        case "MALE":
            return "male";
        case "TRANSGENDER_MALE":
            return "trans male";
        case "INTERSEX":
            return "intersex";
        case "NON_BINARY":
            return "non-binary";
        default:
            return g.toLowerCase();
    }
}

function countOwned(
    scenes: StashDBScene[],
    owned: Set<string>
): number {
    let n = 0;
    for (const s of scenes) if (owned.has(s.id)) n++;
    return n;
}

function StashDBSceneTile({
    scene,
    owned,
    onOpenAddModal,
}: {
    scene: StashDBScene;
    owned: boolean;
    onOpenAddModal: () => void;
}) {
    return (
        <li className="binge-profile-scene-cell is-landscape-thumb">
            <button
                type="button"
                className="binge-profile-scene-card"
                onClick={onOpenAddModal}
                title={scene.title ?? "StashDB scene"}
            >
                <span
                    className="binge-profile-scene-poster"
                    style={
                        scene.coverUrl
                            ? {
                                  backgroundImage: `url(${scene.coverUrl})`,
                              }
                            : undefined
                    }
                />
                <span
                    className={
                        "binge-profile-scene-stashdb-badge" +
                        (owned ? " is-owned" : "")
                    }
                >
                    {owned ? "In library" : "StashDB"}
                </span>
                <span className="binge-profile-scene-hover">
                    <span className="binge-profile-scene-hover-stats">
                        {scene.releaseDate && (
                            <span className="binge-profile-scene-stat">
                                {scene.releaseDate}
                            </span>
                        )}
                    </span>
                    {scene.title && (
                        <span className="binge-profile-scene-title">
                            {scene.title}
                        </span>
                    )}
                </span>
            </button>
        </li>
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
