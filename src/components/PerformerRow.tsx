import type { BingeScene } from "../api/queries";
import { useFilter } from "../filter/FilterContext";

interface PerformerRowProps {
    performers: BingeScene["performers"];
}

// Instagram-style stacked small avatars + "Name1 and Name2" text label.
// Tapping an avatar adds that performer to the active filter chip set.
export function PerformerRow({ performers }: PerformerRowProps) {
    const { add } = useFilter();
    if (performers.length === 0) return null;

    const handleClick = (performer: BingeScene["performers"][number]) => {
        add("performers", {
            id: performer.id,
            name: performer.name,
            image_path: performer.image_path,
        });
    };

    // Cap at 4 visible to keep the row tidy; show "+N" if more
    const visible = performers.slice(0, 4);
    const overflow = performers.length - visible.length;
    const nameSummary = formatNames(performers.map((p) => p.name));

    return (
        <div className="binge-performer-row">
            <div className="binge-performer-stack">
                {visible.map((p, i) => (
                    <button
                        key={p.id}
                        type="button"
                        className="binge-performer-bubble"
                        style={{ zIndex: visible.length - i }}
                        onClick={() => handleClick(p)}
                        title={p.name}
                        aria-label={`Filter by ${p.name}`}
                    >
                        <span
                            className="binge-performer-bubble-img"
                            style={
                                p.image_path
                                    ? { backgroundImage: `url(${p.image_path})` }
                                    : undefined
                            }
                        >
                            {!p.image_path && (
                                <span className="binge-performer-bubble-initial">
                                    {p.name.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </span>
                    </button>
                ))}
                {overflow > 0 && (
                    <span
                        className="binge-performer-bubble binge-performer-overflow"
                        title={`+${overflow} more`}
                    >
                        +{overflow}
                    </span>
                )}
            </div>
            <span className="binge-performer-names">{nameSummary}</span>
        </div>
    );
}

// "A" → "A"; "A, B" → "A and B"; "A, B, C" → "A, B and C"; "A, B, C, D, …" →
// "A, B, C +N more"
function formatNames(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    if (names.length === 3)
        return `${names[0]}, ${names[1]} and ${names[2]}`;
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}
