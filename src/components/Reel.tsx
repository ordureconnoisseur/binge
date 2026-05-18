import { useCallback, useEffect, useRef, useState } from "react";
import { buildSceneFilter, findScenes } from "../api/queries";
import type { BingeScene } from "../api/queries";
import { SceneSlide } from "./SceneSlide";
import { useFilter } from "../filter/FilterContext";

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; scenes: BingeScene[]; total: number }
    | { kind: "error"; message: string };

// How many slides past the active one to aggressively preload. 2 = the
// current slide + next 2 get preload="auto"; everything else gets
// preload="metadata" so we don't bandwidth-hammer the server.
const PRELOAD_AHEAD = 2;

export function Reel() {
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [activeIndex, setActiveIndex] = useState(0);
    const { filter } = useFilter();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Refetch whenever the active filter changes. Reset scroll to top so the
    // user lands on the first matching scene rather than the position from
    // the prior result set.
    useEffect(() => {
        let alive = true;
        setState({ kind: "loading" });
        const scene_filter = buildSceneFilter(
            filter.performers.map((p) => p.id),
            filter.tags.map((t) => t.id),
            filter.studios.map((s) => s.id)
        );
        findScenes({
            filter: { per_page: 20, sort: "random" },
            scene_filter,
        })
            .then((data) => {
                if (!alive) return;
                setState({
                    kind: "ready",
                    scenes: data.findScenes.scenes,
                    total: data.findScenes.count,
                });
                setActiveIndex(0);
                scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
            })
            .catch((err: Error) => {
                if (!alive) return;
                setState({ kind: "error", message: err.message });
            });
        return () => {
            alive = false;
        };
    }, [filter]);

    const handleActive = useCallback(
        (sceneId: string) => {
            if (state.kind !== "ready") return;
            const idx = state.scenes.findIndex((s) => s.id === sceneId);
            if (idx >= 0) setActiveIndex(idx);
        },
        [state]
    );

    if (state.kind === "loading") {
        return <div className="binge-status">loading scenes…</div>;
    }
    if (state.kind === "error") {
        return (
            <div className="binge-status binge-status-error">
                error: {state.message}
            </div>
        );
    }
    if (state.scenes.length === 0) {
        return (
            <div className="binge-status">
                no scenes matched. (any saved filters or chips active?)
            </div>
        );
    }

    return (
        <div className="binge-reel" ref={scrollRef}>
            {state.scenes.map((scene, i) => {
                const distance = i - activeIndex;
                const preload: "auto" | "metadata" =
                    distance >= 0 && distance <= PRELOAD_AHEAD
                        ? "auto"
                        : "metadata";
                return (
                    <SceneSlide
                        key={scene.id}
                        scene={scene}
                        preload={preload}
                        onActive={handleActive}
                    />
                );
            })}
        </div>
    );
}
