import { useState } from "react";
import type { BingeScene } from "../api/queries";
import { sceneIncrementO } from "../api/mutations";
import { HeartBurst } from "./HeartBurst";

interface ActionStackProps {
    scene: BingeScene;
}

// One burst per tap. Spawning is decoupled from the mutation so the user
// always sees the celebration even when the network is slow or fails.
interface Burst {
    id: number;
}

// Each tap spawns one burst; bursts are auto-removed after this many ms.
// CSS animation ends slightly earlier so opacity hits 0 before unmount.
const BURST_LIFETIME_MS = 2700;

// Right-side TikTok/Instagram-style vertical action column. Performer chips
// live in the bottom-left overlay (PerformerRow); this column is for action
// buttons only — heart-O today, future buttons (rate, favorite, tag, more)
// slot in here. Each tap also spawns a one-shot heart burst rendered into
// .binge-heart-burst-layer on the parent slide.
export function ActionStack({ scene }: ActionStackProps) {
    const [oCount, setOCount] = useState<number>(scene.o_counter ?? 0);
    const [oBusy, setOBusy] = useState(false);
    const [oError, setOError] = useState(false);
    const [bursts, setBursts] = useState<Burst[]>([]);

    const handleO = async () => {
        // Spawn the celebration immediately — never gated on the network.
        const burstId = Date.now() + Math.floor(Math.random() * 1000);
        setBursts((prev) => [...prev, { id: burstId }]);
        setTimeout(() => {
            setBursts((prev) => prev.filter((b) => b.id !== burstId));
        }, BURST_LIFETIME_MS);

        if (oBusy) return;
        setOBusy(true);
        setOError(false);
        // Optimistic update — revert on failure
        const previous = oCount;
        setOCount(previous + 1);
        try {
            const next = await sceneIncrementO(scene.id);
            setOCount(next);
        } catch {
            setOCount(previous);
            setOError(true);
            setTimeout(() => setOError(false), 1500);
        } finally {
            setOBusy(false);
        }
    };

    return (
        <>
            {bursts.length > 0 && (
                <div className="binge-heart-burst-layer" aria-hidden="true">
                    {bursts.map((b) => (
                        <HeartBurst key={b.id} />
                    ))}
                </div>
            )}
            <aside className="binge-actions" aria-label="scene actions">
                <button
                    type="button"
                    className={
                        "binge-action-button binge-o-button" +
                        (oCount > 0 ? " is-active" : "") +
                        (oError ? " is-error" : "")
                    }
                    onClick={handleO}
                    aria-label={`Increment O counter (currently ${oCount})`}
                    title="O"
                >
                    <HeartIcon filled={oCount > 0} />
                    <span className="binge-action-count">{oCount}</span>
                </button>
            </aside>
        </>
    );
}

// Heart icon — outlined by default, filled when `filled` is true. ViewBox
// 0 0 24 24, currentColor for stroke + fill so CSS drives the color.
function HeartIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            className="binge-heart"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="1.6em"
            height="1.6em"
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
