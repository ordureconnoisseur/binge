import { useEffect, useRef, useState } from "react";
import {
    findAllPerformers,
    type PerformerSummary,
} from "../api/queries";
import { usePerformerProfile } from "../performer/PerformerProfileContext";

interface AllPerformersModalProps {
    onClose: () => void;
}

type LoadState =
    | { kind: "loading" }
    | { kind: "ready"; performers: PerformerSummary[] }
    | { kind: "error"; message: string };

// Full-screen overlay listing every performer in the library. Reachable
// from Explore via the "See all" link on the Discover performers section.
// Click a performer → set filter + switch to For You + close modal.
// Esc or backdrop click closes without picking.
export function AllPerformersModal({ onClose }: AllPerformersModalProps) {
    const [state, setState] = useState<LoadState>({ kind: "loading" });
    const [query, setQuery] = useState("");
    const { openProfile } = usePerformerProfile();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;
        findAllPerformers()
            .then((performers) => {
                if (!alive) return;
                setState({ kind: "ready", performers });
            })
            .catch((err: Error) => {
                if (!alive) return;
                setState({ kind: "error", message: err.message });
            });
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Profile opens on top of the modal; closing the profile reveals the
    // modal still open. The user can keep browsing performers, or hit close
    // to return to Explore.
    const handlePick = (p: PerformerSummary) => {
        openProfile(p.id);
    };

    const filtered =
        state.kind === "ready"
            ? query.trim()
                ? state.performers.filter((p) =>
                      p.name
                          .toLowerCase()
                          .includes(query.trim().toLowerCase())
                  )
                : state.performers
            : [];

    return (
        <div className="binge-modal-overlay" onClick={onClose}>
            <div
                className="binge-modal"
                ref={panelRef}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="All performers"
            >
                <header className="binge-modal-header">
                    <h2>All performers</h2>
                    <button
                        type="button"
                        className="binge-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </header>
                <div className="binge-modal-toolbar">
                    <input
                        type="text"
                        className="binge-modal-search"
                        placeholder="Search performers…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    {state.kind === "ready" && (
                        <span className="binge-modal-count">
                            {filtered.length}{" "}
                            {filtered.length === 1
                                ? "performer"
                                : "performers"}
                        </span>
                    )}
                </div>
                <div className="binge-modal-body">
                    {state.kind === "loading" && (
                        <div className="binge-status">loading…</div>
                    )}
                    {state.kind === "error" && (
                        <div className="binge-status binge-status-error">
                            error: {state.message}
                        </div>
                    )}
                    {state.kind === "ready" && filtered.length === 0 && (
                        <div className="binge-status">no matches</div>
                    )}
                    {state.kind === "ready" && filtered.length > 0 && (
                        <ul className="binge-following-grid">
                            {filtered.map((p) => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        className={
                                            "binge-follow-card" +
                                            (p.favorite ? " is-favorite" : "")
                                        }
                                        onClick={() => handlePick(p)}
                                    >
                                        <span
                                            className="binge-follow-avatar"
                                            style={
                                                p.image_path
                                                    ? {
                                                          backgroundImage: `url(${p.image_path})`,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {!p.image_path && (
                                                <span className="binge-follow-initial">
                                                    {p.name
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                </span>
                                            )}
                                        </span>
                                        <span className="binge-follow-name">
                                            {p.name}
                                        </span>
                                        {typeof p.scene_count === "number" &&
                                            p.scene_count > 0 && (
                                                <span className="binge-follow-count">
                                                    {p.scene_count} scene
                                                    {p.scene_count === 1
                                                        ? ""
                                                        : "s"}
                                                </span>
                                            )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
