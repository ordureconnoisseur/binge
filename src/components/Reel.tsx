import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    buildSceneFilter,
    findSceneById,
    findScenes,
    findScenesByIds,
} from "../api/queries";
import { transformObjectFilter } from "../api/savedFilterTransform";
import type { BingeScene } from "../api/queries";
import { SceneSlide } from "./SceneSlide";
import { useFilter } from "../filter/FilterContext";
import { useTab } from "../tabs/TabContext";
import { createChainAlgo, type ChainAlgo } from "../reel/chainAlgo";
import { useAutoHideTabBar } from "../hooks/useAutoHideTabBar";
import { BingeLoading } from "./BingeLoading";

type LoadState =
    | { kind: "loading" }
    | {
          kind: "ready";
          scenes: BingeScene[];
          total: number;
          page: number;
          hasMore: boolean;
      }
    | { kind: "error"; message: string };

// How many scenes to request per page.
const PAGE_SIZE = 20;

// When the active slide is within this many of the end of the loaded list,
// fire the next page so the user doesn't reach the wall.
const PAGINATE_TRIGGER_DISTANCE = 5;

// Hard ceiling on accumulated scenes to keep memory bounded. The user
// would have to scroll past 500 slides to hit this; well past binge limits.
const MAX_LOADED = 500;

// Virtualizer overscan: how many off-screen slides to keep mounted on
// each side of the visible window. 1 gives ~3 mounted total (one ahead,
// one behind, one active) — well under Chrome's hardware decoder pool.
const OVERSCAN = 1;

export function Reel() {
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [activeIndex, setActiveIndex] = useState(0);
    // Lifted O-counts keyed by scene id. SceneSlide writes here on every
    // optimistic update + server confirm; reading from here on remount
    // means a scrolled-past liked scene comes back with the right count.
    const [oOverrides, setOOverrides] = useState<Record<string, number>>({});
    const setOOverride = useCallback((sceneId: string, value: number) => {
        setOOverrides((prev) => ({ ...prev, [sceneId]: value }));
    }, []);
    // Same lifted-override pattern for rating and favourite status —
    // each scene's most-recent value survives virtualizer unmount.
    const [ratingOverrides, setRatingOverrides] = useState<
        Record<string, number | null>
    >({});
    const setRatingOverride = useCallback(
        (sceneId: string, value: number | null) => {
            setRatingOverrides((prev) => ({ ...prev, [sceneId]: value }));
        },
        []
    );
    // Collection memberships keyed first by sceneId, then by tagName.
    // Generalises the old single-favourite override so the bookmark
    // menu's multiple folders all survive virtualizer unmount.
    const [collectionOverrides, setCollectionOverrides] = useState<
        Record<string, Record<string, boolean>>
    >({});
    const setCollectionOverride = useCallback(
        (sceneId: string, tagName: string, value: boolean) => {
            setCollectionOverrides((prev) => ({
                ...prev,
                [sceneId]: { ...(prev[sceneId] ?? {}), [tagName]: value },
            }));
        },
        []
    );
    const { filter, activeSavedFilter } = useFilter();
    const {
        pinFirstSceneId,
        setPinFirstSceneId,
        pinnedQueue,
        setPinnedQueue,
        reelMode,
        setReelMode,
        setTab,
    } = useTab();
    const scrollRef = useRef<HTMLDivElement>(null);
    // Chained-mode algo instance. Created on entry to chained mode in
    // the initial-load effect; torn down (set to null) on exit. Pure
    // module — see src/reel/chainAlgo.ts.
    const chainAlgoRef = useRef<ChainAlgo | null>(null);
    // Track which scene ids have already been fed into the algo's
    // onPlay so we don't double-count if the user scrolls back and
    // forward across the same slide.
    const playedSeenRef = useRef<Set<string>>(new Set());

    // Filter takeover: any user-driven chip change while in chained
    // mode snaps us back to random + bounces to the For You tab. The
    // tab move matters because the chained reel renders under the
    // Explore tab — without the bounce, the user would suddenly see
    // the Explore grid mid-watch when their chip flips reelMode back
    // to random. The Explore handler's clear-to-empty replace doesn't
    // trigger this — only a non-empty filter does.
    useEffect(() => {
        if (reelMode !== "chained") return;
        const empty =
            filter.performers.length === 0 &&
            filter.tags.length === 0 &&
            filter.studios.length === 0;
        if (!empty) {
            setReelMode("random");
            setTab("foryou");
        }
    }, [reelMode, filter, setReelMode, setTab]);

    const sceneCount = state.kind === "ready" ? state.scenes.length : 0;
    const virtualizer = useVirtualizer({
        count: sceneCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => window.innerHeight,
        overscan: OVERSCAN,
        getItemKey: (i) =>
            state.kind === "ready" ? state.scenes[i].id : i,
    });

    // Hide the tab/header chrome when scrolling down, reveal it on any
    // scroll-up. See useAutoHideTabBar — shared with the other tabs.
    useAutoHideTabBar(scrollRef);

    // Scroll-end tracker — drives the SceneSlide deferred-load behaviour.
    // 5px deadzone is critical: scroll-snap fires a stream of tiny
    // post-snap adjustment events; without the deadzone, the 200ms
    // settle timer would reset on every micro-event and `isScrolling`
    // would stay true forever, locking out video src assignment.
    const [isScrolling, setIsScrolling] = useState(false);
    const lastScrollTopRef = useRef(0);
    const scrollEndTimerRef = useRef<number | null>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        lastScrollTopRef.current = el.scrollTop;
        const onScroll = () => {
            const current = el.scrollTop;
            const delta = Math.abs(current - lastScrollTopRef.current);
            lastScrollTopRef.current = current;
            // Sub-deadzone deltas are scroll-snap settling motion, not
            // user-driven scrolling. Ignore.
            if (delta < 5) return;
            setIsScrolling(true);
            if (scrollEndTimerRef.current !== null) {
                window.clearTimeout(scrollEndTimerRef.current);
            }
            scrollEndTimerRef.current = window.setTimeout(() => {
                setIsScrolling(false);
                scrollEndTimerRef.current = null;
            }, 200);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (scrollEndTimerRef.current !== null) {
                window.clearTimeout(scrollEndTimerRef.current);
                scrollEndTimerRef.current = null;
            }
        };
    }, []);
    // Latest in-flight fetch token. Stale responses (from a previous
    // filter set, or duplicate next-page calls) compare and bail.
    const fetchTokenRef = useRef(0);

    // Sort seed: with sort=random Stash returns a different shuffle every
    // call. Pinning a seed makes pages 2,3,4… stay consistent with page 1.
    // New filter set → new seed → new shuffle. When a Stash saved
    // filter is active, we use its sort directly (which may be a
    // pinned random_<seed> already, or rating/date/etc).
    const sortSeed = useMemo(
        () => `random_${Math.floor(Math.random() * 1e9)}`,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filter, activeSavedFilter]
    );

    // scene_filter — either binge's chip-derived filter or the saved
    // filter's object_filter (after transforming from Stash's UI
    // storage shape to the GraphQL input shape; see
    // savedFilterTransform.ts).
    const sceneFilter = useMemo(() => {
        if (activeSavedFilter) {
            return transformObjectFilter(activeSavedFilter.object_filter);
        }
        return buildSceneFilter(
            filter.performers.map((p) => p.id),
            filter.tags.map((t) => t.id),
            filter.studios.map((s) => s.id)
        );
    }, [filter, activeSavedFilter]);

    // find_filter sort + direction — saved filter overrides binge's
    // random when active. `q` is dropped (Stash's text search isn't
    // meaningful in the reel).
    const findFilterBase = useMemo<{
        sort: string;
        direction: "ASC" | "DESC";
    }>(() => {
        if (activeSavedFilter?.find_filter?.sort) {
            return {
                sort: activeSavedFilter.find_filter.sort,
                direction: activeSavedFilter.find_filter.direction ?? "DESC",
            };
        }
        return { sort: sortSeed, direction: "DESC" };
    }, [activeSavedFilter, sortSeed]);

    // Initial load (and reload on filter/mode change).
    //
    // Random mode (the default — current behaviour): fetch a random
    // page 1 plus the pinned scene if one is set; hoist the pinned
    // scene to position 0.
    //
    // Chained mode (set by an Explore tile tap): fetch ONLY the pinned
    // scene. Build a fresh ChainAlgo seeded with that scene id in the
    // `visited` set so the algo never picks it again. Subsequent
    // scenes are produced by algoRef.nextBatch() in the pagination
    // effect below.
    useEffect(() => {
        const token = ++fetchTokenRef.current;
        setState({ kind: "loading" });
        const pin = pinFirstSceneId;
        const queue = pinnedQueue;
        playedSeenRef.current = new Set();

        // Queue path: deterministic ordered playlist, no
        // pagination — the reel renders exactly these scenes in
        // this order and bottoms out at the last one. Used by
        // PerformerSceneGrid so tapping a scene plays the grid in
        // sequence rather than dropping into a random feed.
        if (queue) {
            chainAlgoRef.current = null;
            findScenesByIds(queue.ids)
                .then((scenes) => {
                    if (token !== fetchTokenRef.current) return;
                    setState({
                        kind: "ready",
                        scenes,
                        total: scenes.length,
                        page: 1,
                        hasMore: false,
                    });
                    // startIndex indexes the ORIGINAL id list, but
                    // findScenesByIds can drop deleted scenes (and
                    // isn't guaranteed to preserve order), so locate
                    // the tapped scene by id in the fetched list
                    // rather than trusting the raw index — otherwise a
                    // missing earlier scene shifts everything and the
                    // reel opens on the wrong scene.
                    const targetId = queue.ids[queue.startIndex];
                    const found = scenes.findIndex(
                        (s) => s.id === targetId
                    );
                    const idx =
                        found >= 0
                            ? found
                            : Math.min(
                                  Math.max(0, queue.startIndex),
                                  Math.max(0, scenes.length - 1)
                              );
                    setActiveIndex(idx);
                    setOOverrides({});
                    setRatingOverrides({});
                    setCollectionOverrides({});
                    // Defer scroll until the slides are laid out —
                    // before commit, scrollHeight is still 0 and
                    // scrollTo floors to top.
                    window.requestAnimationFrame(() => {
                        const el = scrollRef.current;
                        if (!el) return;
                        el.scrollTo({
                            top: idx * el.clientHeight,
                            behavior: "auto",
                        });
                    });
                    setPinnedQueue(null);
                })
                .catch((err: Error) => {
                    if (token !== fetchTokenRef.current) return;
                    setState({ kind: "error", message: err.message });
                    setPinnedQueue(null);
                });
            return;
        }

        if (reelMode === "chained" && pin) {
            // Chained path: fetch the pinned scene, build the algo,
            // FEED THE PINNED SCENE INTO THE CONTEXT via onPlay BEFORE
            // calling setState. The pagination effect fires
            // synchronously off the state transition, which then calls
            // algo.nextBatch — and that batch is only useful if the
            // context already reflects the seeded scene's performers
            // and tags. (The IntersectionObserver-driven onPlay only
            // fires later, after the next paint.)
            const algo = createChainAlgo();
            chainAlgoRef.current = algo;
            findSceneById(pin)
                .then((pinnedScene) => {
                    if (token !== fetchTokenRef.current) return;
                    if (!pinnedScene) {
                        setState({
                            kind: "error",
                            message: "pinned scene not found",
                        });
                        return;
                    }
                    // Prime the context with the seed scene's attributes.
                    algo.onPlay(pinnedScene);
                    // Mark the seed as already-played so handleActive's
                    // dedupe doesn't double-count when the IO fires.
                    playedSeenRef.current.add(pinnedScene.id);
                    setState({
                        kind: "ready",
                        scenes: [pinnedScene],
                        total: 1,
                        page: 1,
                        // Chained mode never "runs out" — set hasMore
                        // true so the pagination effect always tries
                        // to produce the next batch.
                        hasMore: true,
                    });
                    setActiveIndex(0);
                    setOOverrides({});
                    setRatingOverrides({});
                    setCollectionOverrides({});
                    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
                    setPinFirstSceneId(null);
                })
                .catch((err: Error) => {
                    if (token !== fetchTokenRef.current) return;
                    setState({ kind: "error", message: err.message });
                    setPinFirstSceneId(null);
                });
            return;
        }

        // Random path (existing behaviour). Drop any prior chained
        // algo so it gets GC'd.
        chainAlgoRef.current = null;
        const firstPage = findScenes({
            filter: {
                page: 1,
                per_page: PAGE_SIZE,
                sort: findFilterBase.sort,
                direction: findFilterBase.direction,
            },
            scene_filter: sceneFilter,
        });
        const pinned = pin ? findSceneById(pin) : Promise.resolve(null);
        Promise.all([firstPage, pinned])
            .then(([data, pinnedScene]) => {
                if (token !== fetchTokenRef.current) return;
                let scenes = data.findScenes.scenes;
                if (pinnedScene) {
                    scenes = [
                        pinnedScene,
                        ...scenes.filter((s) => s.id !== pinnedScene.id),
                    ];
                }
                setState({
                    kind: "ready",
                    scenes,
                    total: data.findScenes.count,
                    page: 1,
                    hasMore:
                        data.findScenes.scenes.length === PAGE_SIZE &&
                        data.findScenes.scenes.length < data.findScenes.count,
                });
                setActiveIndex(0);
                // New scene population — drop any optimistic O-counts from
                // the previous filter set so we don't apply them to
                // unrelated scenes.
                setOOverrides({});
                scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
                if (pin) setPinFirstSceneId(null);
            })
            .catch((err: Error) => {
                if (token !== fetchTokenRef.current) return;
                setState({ kind: "error", message: err.message });
                if (pin) setPinFirstSceneId(null);
            });
        // pinFirstSceneId is intentionally NOT a dependency — we only want
        // it consumed when the filter/seed/mode changes (which is what
        // brought the user here). Reading it via closure is fine because
        // the entry-point handlers all set pin BEFORE calling setTab.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortSeed, sceneFilter, findFilterBase, reelMode]);

    // Auto-paginate: when the active slide is near the tail, fetch the
    // next batch and append. Branches on reelMode — random mode keeps
    // its page-based pagination; chained mode pulls from the algo.
    const loadingMoreRef = useRef(false);
    useEffect(() => {
        if (state.kind !== "ready") return;
        if (!state.hasMore) return;
        if (loadingMoreRef.current) return;
        if (state.scenes.length >= MAX_LOADED) return;

        const distanceToEnd = state.scenes.length - 1 - activeIndex;
        if (distanceToEnd > PAGINATE_TRIGGER_DISTANCE) return;

        loadingMoreRef.current = true;
        const token = fetchTokenRef.current;

        if (reelMode === "chained" && chainAlgoRef.current) {
            const algo = chainAlgoRef.current;
            algo.nextBatch(PAGE_SIZE)
                .then((fresh) => {
                    if (token !== fetchTokenRef.current) return;
                    setState((s) => {
                        if (s.kind !== "ready") return s;
                        const existingIds = new Set(s.scenes.map((x) => x.id));
                        const deduped = fresh.filter(
                            (x) => !existingIds.has(x.id)
                        );
                        return {
                            ...s,
                            scenes: [...s.scenes, ...deduped],
                            page: s.page + 1,
                            // If the algo couldn't produce any new
                            // scenes (library exhausted relative to
                            // visited set), stop paginating.
                            hasMore: deduped.length > 0,
                        };
                    });
                })
                .catch((err) => {
                    // Pagination retries on next scroll; just surface
                    // in DevTools so the failure is debuggable.
                    console.error(
                        "[binge] chained-mode pagination failed",
                        err
                    );
                })
                .finally(() => {
                    loadingMoreRef.current = false;
                });
            return;
        }

        // Random mode (existing behaviour).
        const nextPage = state.page + 1;
        findScenes({
            filter: {
                page: nextPage,
                per_page: PAGE_SIZE,
                sort: findFilterBase.sort,
                direction: findFilterBase.direction,
            },
            scene_filter: sceneFilter,
        })
            .then((data) => {
                if (token !== fetchTokenRef.current) return;
                setState((s) => {
                    if (s.kind !== "ready") return s;
                    // Dedup by id — safety against random sort edge cases.
                    const existingIds = new Set(s.scenes.map((x) => x.id));
                    const fresh = data.findScenes.scenes.filter(
                        (x) => !existingIds.has(x.id)
                    );
                    return {
                        ...s,
                        scenes: [...s.scenes, ...fresh],
                        page: nextPage,
                        hasMore:
                            fresh.length > 0 &&
                            s.scenes.length + fresh.length <
                                data.findScenes.count,
                    };
                });
            })
            .catch(() => {
                /* leave hasMore alone — the user can retry by scrolling back into the trigger zone */
            })
            .finally(() => {
                loadingMoreRef.current = false;
            });
    }, [activeIndex, state, sortSeed, sceneFilter, findFilterBase, reelMode]);

    // Stable handleActive — keep state in a ref so callback identity
    // doesn't churn on every pagination, which would otherwise tear down
    // every SceneSlide's IntersectionObserver mid-scroll.
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    const handleActive = useCallback((sceneId: string) => {
        const s = stateRef.current;
        if (s.kind !== "ready") return;
        const idx = s.scenes.findIndex((x) => x.id === sceneId);
        if (idx >= 0) setActiveIndex(idx);

        // Chained mode: feed each newly-played scene into the algo so
        // its weighted context evolves with what the user is actually
        // watching. Guard against double-counting on scroll back +
        // forward via playedSeenRef.
        if (chainAlgoRef.current && !playedSeenRef.current.has(sceneId)) {
            const scene = s.scenes.find((x) => x.id === sceneId);
            if (scene) {
                playedSeenRef.current.add(sceneId);
                chainAlgoRef.current.onPlay(scene);
            }
        }
    }, []);

    // Always render the scroll container so scrollRef stays attached
    // across loading/empty/ready transitions. Without this, the virtualizer
    // (initialised on first render while loading) can latch onto a null
    // scroll element and never re-wire when .binge-reel later appears —
    // observed as "tab away, come back, nothing loads."
    const scenes = state.kind === "ready" ? state.scenes : [];
    const errorOrEmpty =
        state.kind === "error"
            ? `error: ${state.message}`
            : state.kind === "ready" && state.scenes.length === 0
              ? "no scenes matched. (any saved filters or chips active?)"
              : null;
    return (
        <div className="binge-reel" ref={scrollRef}>
            {state.kind === "loading" && (
                <div className="binge-status-overlay binge-reel-loading">
                    <BingeLoading />
                </div>
            )}
            {errorOrEmpty && (
                <div
                    className={
                        "binge-status binge-status-overlay" +
                        (state.kind === "error" ? " binge-status-error" : "")
                    }
                >
                    {errorOrEmpty}
                </div>
            )}
            <div
                className="binge-reel-virtual"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: "relative",
                    width: "100%",
                }}
            >
                {virtualizer.getVirtualItems().map((vi) => {
                    const scene = scenes[vi.index];
                    if (!scene) return null;
                    return (
                        <div
                            key={vi.key}
                            className="binge-slide-wrapper"
                            style={{
                                transform: `translateY(${vi.start}px)`,
                                height: `${vi.size}px`,
                            }}
                        >
                            <SceneSlide
                                scene={scene}
                                preload="auto"
                                onActive={handleActive}
                                oCountOverride={oOverrides[scene.id]}
                                onOCountChange={setOOverride}
                                ratingOverride={ratingOverrides[scene.id]}
                                onRatingChange={setRatingOverride}
                                collectionsOverride={
                                    collectionOverrides[scene.id]
                                }
                                onCollectionChange={setCollectionOverride}
                                currentlyScrolling={isScrolling}
                                onAutoAdvance={() => {
                                    // Smooth-scroll to the next slide.
                                    // The virtualizer routes through
                                    // the snap container so this stays
                                    // consistent with how user swipes
                                    // update scroll position.
                                    const next = vi.index + 1;
                                    if (next < scenes.length) {
                                        virtualizer.scrollToIndex(next, {
                                            align: "start",
                                            behavior: "smooth",
                                        });
                                    }
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
