import { useEffect, useMemo, useState } from "react";
import type { BingeScene } from "../api/queries";
import { PerformerSheet } from "./PerformerSheet";
import { usePerformerProfile } from "../performer/PerformerProfileContext";

interface PerformerRowProps {
    performers: BingeScene["performers"];
}

// Instagram-style stacked small avatars + "Name1 and Name2" text label.
// Tapping an avatar adds that performer to the active filter chip set.
// The Follow button displays the primary (first) performer's favorite
// state and opens a bottom sheet listing every performer in the scene
// with individual Follow/Following pills (Instagram "Collaborators" UI).
export function PerformerRow({ performers }: PerformerRowProps) {
    const { openProfile } = usePerformerProfile();
    const primary = performers[0];
    // Mirror the primary's favorite state for the inline button. Updated
    // optimistically from the sheet via onFavoriteChange.
    const [primaryFav, setPrimaryFav] = useState<boolean>(
        primary?.favorite ?? false
    );
    const [sheetOpen, setSheetOpen] = useState(false);

    useEffect(() => {
        setPrimaryFav(primary?.favorite ?? false);
    }, [primary?.id, primary?.favorite]);

    if (performers.length === 0) return null;

    // Tapping a bubble — single performer goes straight to that
    // profile; multi-performer opens the PerformerSheet picker so
    // the user can choose which one to drill into (and see/toggle
    // each performer's favourite in-place). Matches the iOS
    // PerformerPickerSheet pattern.
    const handleClick = (performer: BingeScene["performers"][number]) => {
        if (performers.length > 1) {
            setSheetOpen(true);
        } else {
            openProfile(performer.id);
        }
    };

    const handleSheetFavoriteChange = (id: string, value: boolean) => {
        if (id === primary?.id) setPrimaryFav(value);
    };

    // Cap at 4 visible to keep the row tidy; show "+N" if more
    const visible = performers.slice(0, 4);
    const overflow = performers.length - visible.length;
    // The reel re-renders this row constantly during like-bursts, hover
    // states, etc — memoise the joined name string so we don't rerun
    // map + format every paint.
    const nameSummary = useMemo(
        () => formatNames(performers.map((p) => p.name)),
        [performers]
    );

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
            <button
                type="button"
                className="binge-performer-names"
                onClick={() => primary && openProfile(primary.id)}
                aria-label={`Open ${primary?.name ?? "performer"} profile`}
            >
                {nameSummary}
            </button>
            <button
                type="button"
                className={
                    "binge-follow-btn" + (primaryFav ? " is-following" : "")
                }
                onClick={() => setSheetOpen(true)}
                title="Manage follows"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
            >
                {primaryFav ? "Favourited" : "Favourite"}
            </button>
            {sheetOpen && (
                <PerformerSheet
                    performers={performers}
                    onClose={() => setSheetOpen(false)}
                    onFavoriteChange={handleSheetFavoriteChange}
                />
            )}
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
