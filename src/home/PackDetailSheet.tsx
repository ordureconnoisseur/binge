import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PackFeedItem, SceneFeedItem } from "./useFeed";
import { useTab } from "../tabs/TabContext";

// Fullscreen sheet shown when the user taps a Pack feed card.
// Lists every scene in the pack as a 3-column grid; tapping a
// tile drops into the For You reel pre-pinned to that scene with
// the pack's scene set queued behind it.
//
// Portalled to <body> for the same z-index reasons SaveSheet and
// PerformerSheet use — the parent feed has its own stacking
// context that would otherwise cap the sheet beneath the action
// stack.
export function PackDetailSheet({
    pack,
    onClose,
}: {
    pack: PackFeedItem;
    onClose: () => void;
}) {
    const { setTab, setPinFirstSceneId, setPinnedQueue } = useTab();

    // Esc dismisses on desktop — matches the rest of the sheets.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const handlePick = (scene: SceneFeedItem) => {
        // Same handoff pattern Home's "Watch full scene" uses —
        // pin the tapped scene as slot N of the queued list, so
        // the reel starts at the tap target and walks the rest
        // of the pack in order.
        const ids = pack.scenes.map((s) => s.sceneId);
        const startIndex = Math.max(
            0,
            ids.indexOf(scene.sceneId)
        );
        setPinFirstSceneId(scene.sceneId);
        setPinnedQueue({ ids, startIndex });
        setTab("foryou");
        onClose();
    };

    return createPortal(
        <div className="binge-sheet-root">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet binge-pack-sheet"
                role="dialog"
                aria-label={`${pack.primaryPerformer.name} — pack`}
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <header className="binge-pack-sheet-header">
                    <div className="binge-pack-sheet-title">
                        {pack.primaryPerformer.name}
                    </div>
                    <div className="binge-pack-sheet-sub">
                        {pack.sceneCount} new scenes
                    </div>
                </header>
                <div className="binge-pack-sheet-grid">
                    {pack.scenes.map((scene) => (
                        <button
                            type="button"
                            key={scene.sceneId}
                            className="binge-pack-sheet-tile"
                            onClick={() => handlePick(scene)}
                            aria-label={scene.title ?? "Open scene"}
                            style={
                                scene.screenshot
                                    ? {
                                          backgroundImage: `url(${scene.screenshot})`,
                                      }
                                    : undefined
                            }
                        />
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}
