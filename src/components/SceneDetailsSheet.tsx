import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { BingeScene } from "../api/queries";

interface SceneDetailsSheetProps {
    scene: BingeScene;
    onClose: () => void;
}

// Instagram caption/details modal — slides up from the bottom. Header
// shows studio + date; body shows the full title + description; footer
// is a wrap of tag chips rendered as Instagram-style hashtags.
//
// Portalled to <body> for the same stacking-context reason as
// PerformerSheet — the slide's `.binge-overlay` would otherwise cap
// our z-index beneath the action stack.
export function SceneDetailsSheet({ scene, onClose }: SceneDetailsSheetProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const title = scene.title?.trim() || "";
    // Fallback when no scraped title: derive from the first file's path,
    // strip directory + extension. Lets every scene have something
    // clickable that opens it in Stash.
    const filenameTitle = !title ? basenameNoExt(scene.files?.[0]?.path) : "";
    const displayTitle = title || filenameTitle;
    const details = scene.details?.trim() || "";
    const studioName = scene.studio?.name;
    const dateLabel = formatDate(scene.date);

    return createPortal(
        <div className="binge-sheet-root">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet binge-details-sheet"
                role="dialog"
                aria-label="Scene details"
            >
                <div className="binge-sheet-handle" aria-hidden="true" />
                <div className="binge-details-meta">
                    {studioName && (
                        <span className="binge-details-studio">
                            {studioName}
                        </span>
                    )}
                    {studioName && dateLabel && (
                        <span className="binge-details-dot">·</span>
                    )}
                    {dateLabel && (
                        <span className="binge-details-date">{dateLabel}</span>
                    )}
                </div>
                {displayTitle && (
                    <h2
                        className={
                            "binge-details-title" +
                            (filenameTitle ? " is-filename" : "")
                        }
                    >
                        <a
                            href={`/scenes/${scene.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="binge-details-title-link"
                            title="Open scene in Stash"
                        >
                            {displayTitle}
                        </a>
                    </h2>
                )}
                {details && (
                    <p className="binge-details-body">{details}</p>
                )}
                {scene.tags && scene.tags.length > 0 && (
                    <ul className="binge-hashtag-list">
                        {scene.tags.map((t) => (
                            <li key={t.id}>
                                <span className="binge-hashtag">
                                    #{toHashtag(t.name)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {!displayTitle &&
                    !details &&
                    (!scene.tags || scene.tags.length === 0) && (
                        <p className="binge-details-empty">
                            No description.
                        </p>
                    )}
            </div>
        </div>,
        document.body
    );
}

// Instagram hashtags are conventionally one camelCase token, no spaces
// or punctuation. Normalize: strip non-word chars, collapse to a single
// run, leave casing alone so "Big Naturals" → "BigNaturals".
function toHashtag(name: string): string {
    return name
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

// Strip directory + final extension from a path. Handles both Windows
// (\) and Unix (/) separators. "C:\\Porn\\X\\foo.bar.mp4" → "foo.bar".
// Returns empty when given empty/undefined.
function basenameNoExt(path: string | undefined): string {
    if (!path) return "";
    const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const filename = lastSep >= 0 ? path.slice(lastSep + 1) : path;
    const lastDot = filename.lastIndexOf(".");
    // Only treat as extension if dot isn't the first char (".hidden").
    return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

// Stash date format "YYYY-MM-DD" → "28 February 2024" Instagram-style.
function formatDate(raw: string | null): string {
    if (!raw) return "";
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    const monthIdx = Math.max(0, Math.min(11, Number(m[2]) - 1));
    const day = Number(m[3]);
    return `${day} ${months[monthIdx]} ${m[1]}`;
}
