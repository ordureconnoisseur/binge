import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PackFeedItem, SceneFeedItem } from "./useFeed";
import { useTab } from "../tabs/TabContext";
import { useFilter } from "../filter/FilterContext";

// Fullscreen sheet shown when the user taps a Pack feed card.
// Lists every scene in the pack as a 3-column grid; tapping a
// tile drops into the For You reel pre-pinned to that scene with
// the pack's scene set queued behind it.
//
// Portalled to <body> for the same z-index reasons SaveSheet and
// PerformerSheet use — the parent feed has its own stacking
// context that would otherwise cap the sheet beneath the action
// stack.
//
// 需求1：
//   - 二层封面调整为 3:4 竖屏，右对齐，底部叠加标题（类似图库封面）。
//   - 进入 reel 时同步把主演作为 performer 筛选 chip 写进 FilterContext，
//     这样 FilterBar（带头像名字×）和 FilterSheet 都能显示当前生效的
//     筛选条件，用户可以一键 × 清除。queue 仍负责有序播放整包场景，
//     filter 仅作可视指示（queue 路径在 Reel 中优先级高于 filter）。
export function PackDetailSheet({
    pack,
    onClose,
}: {
    pack: PackFeedItem;
    onClose: () => void;
}) {
    const { setTab, setPinFirstSceneId, setPinnedQueue } = useTab();
    const { replace } = useFilter();

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
        // 需求1：把主演作为筛选 chip 写入 FilterContext，让 FilterBar
        // 和 FilterSheet 显示当前生效的筛选条件（头像 + 名字 + ×）。
        // 只填 id/name/image_path —— FilterEntry 这三个字段就够渲染
        // chip；FilterBar 会用 image_path 显示头像，找不到则降级为首字母。
        const p = pack.primaryPerformer;
        replace({
            performers: [
                {
                    id: p.id,
                    name: p.name,
                    image_path: p.imagePath ?? null,
                },
            ],
            tags: [],
            studios: [],
        });
        // Clear any stale single-scene pin — the reel consumes the
        // queue here (startIndex starts it at the tapped scene), and
        // a leftover pin would otherwise resurface in chained mode.
        // Mirrors SceneFeedCard's "Watch full scene" handoff.
        //
        // Bug 5 修复：setTab 会清除 pin/queue，因此 setPinnedQueue
        // 必须在 setTab 之后调用，利用 React 18 批处理"后写胜"语义。
        // 同理 replace 也必须在 setTab 之后调用 —— setTab 自身不动
        // filter，但保持调用顺序与 handleWatchFullScene 一致更安全。
        setTab("foryou");
        setPinFirstSceneId(null);
        setPinnedQueue({ ids, startIndex });
        onClose();
    };

    return createPortal(
        <div className="binge-sheet-root">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet binge-pack-sheet"
                role="dialog"
                aria-label={`${pack.primaryPerformer.name} — 包`}
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <header className="binge-pack-sheet-header">
                    <div className="binge-pack-sheet-title">
                        {pack.primaryPerformer.name}
                    </div>
                    <div className="binge-pack-sheet-sub">
                        {pack.sceneCount} 个新场景
                    </div>
                </header>
                <div className="binge-pack-sheet-grid">
                    {pack.scenes.map((scene) => (
                        <button
                            type="button"
                            key={scene.sceneId}
                            className="binge-pack-sheet-tile"
                            onClick={() => handlePick(scene)}
                            aria-label={scene.title ?? "打开场景"}
                            style={
                                scene.screenshot
                                    ? {
                                          // 引号包裹 URL：screenshot 地址含 ?t= 查询参数，
                                          // 未引号的 url() 在 CSS 规范中非法，部分浏览器
                                          // 会丢弃整条声明导致封面不显示。
                                          backgroundImage: `url("${scene.screenshot}")`,
                                      }
                                    : undefined
                            }
                        >
                            {/* 需求1：二层封面底部叠加标题（类似图库封面），
                                标题右对齐，与封面右对齐保持一致。空标题降级为
                                "未命名" 以保证视觉占位。 */}
                            <span className="binge-pack-sheet-tile-title">
                                {scene.title?.trim() || "未命名"}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}
