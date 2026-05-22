import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BingeScene } from "../api/queries";
import { setPerformerFavorite } from "../api/mutations";
import { usePerformerProfile } from "../performer/PerformerProfileContext";

interface PerformerSheetProps {
    performers: BingeScene["performers"];
    onClose: () => void;
    // Lets the opener (PerformerRow) sync its primary-favorite display.
    onFavoriteChange?: (performerId: string, favorite: boolean) => void;
}

// Instagram "Collaborators"-style bottom sheet. Lists every performer in
// the scene with avatar + name + a per-row Follow/Following pill. Tapping
// the avatar/name jumps into that performer's reel (sets filter, switches
// to For You, closes the sheet). Backdrop or Esc dismisses.
export function PerformerSheet({
    performers,
    onClose,
    onFavoriteChange,
}: PerformerSheetProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Portal to <body> so the sheet escapes ancestor stacking contexts.
    // The slide's `.binge-overlay` has its own z-index (= it creates a
    // stacking context), which would otherwise cap our z:80 beneath the
    // action stack rendered at the slide's higher tier.
    return createPortal(
        <div className="binge-sheet-root">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet"
                role="dialog"
                aria-label="Performers in this scene"
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <h2 className="binge-sheet-title">
                    {performers.length > 1 ? "Performers" : "Performer"}
                </h2>
                <ul className="binge-sheet-list">
                    {performers.map((p) => (
                        <PerformerSheetRow
                            key={p.id}
                            performer={p}
                            onClose={onClose}
                            onFavoriteChange={onFavoriteChange}
                        />
                    ))}
                </ul>
            </div>
        </div>,
        document.body
    );
}

interface RowProps {
    performer: BingeScene["performers"][number];
    onClose: () => void;
    onFavoriteChange?: (performerId: string, favorite: boolean) => void;
}

function PerformerSheetRow({ performer, onClose, onFavoriteChange }: RowProps) {
    const [favorite, setFavorite] = useState<boolean>(performer.favorite);
    const [busy, setBusy] = useState(false);
    const { openProfile } = usePerformerProfile();

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        const previous = favorite;
        const next = !previous;
        setFavorite(next);
        onFavoriteChange?.(performer.id, next);
        try {
            const confirmed = await setPerformerFavorite(performer.id, next);
            setFavorite(confirmed);
            onFavoriteChange?.(performer.id, confirmed);
        } catch {
            setFavorite(previous);
            onFavoriteChange?.(performer.id, previous);
        } finally {
            setBusy(false);
        }
    };

    // Clicking the row body (not the button) closes the sheet and opens
    // this performer's Instagram-style profile page on top of it. The
    // user can browse scenes, follow, etc., before optionally drilling
    // into the reel from a scene card.
    const handlePick = () => {
        onClose();
        openProfile(performer.id);
    };

    return (
        <li className="binge-sheet-row">
            <button
                type="button"
                className="binge-sheet-row-main"
                onClick={handlePick}
                title={`Scroll ${performer.name}'s content`}
            >
                <span
                    className="binge-sheet-avatar"
                    style={
                        performer.image_path
                            ? {
                                  backgroundImage: `url(${performer.image_path})`,
                              }
                            : undefined
                    }
                >
                    {!performer.image_path && (
                        <span className="binge-sheet-initial">
                            {performer.name.charAt(0).toUpperCase()}
                        </span>
                    )}
                </span>
                <span className="binge-sheet-name">{performer.name}</span>
            </button>
            <button
                type="button"
                className={
                    "binge-follow-btn" + (favorite ? " is-following" : "")
                }
                onClick={handleToggle}
                disabled={busy}
                aria-pressed={favorite}
            >
                {favorite ? "Favourited" : "Favourite"}
            </button>
        </li>
    );
}
