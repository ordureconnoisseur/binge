import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    fetchSceneFileDetails,
    type BingeScene,
    type SceneFileDetails,
} from "../api/queries";

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

    // Lazy-load tech details only when the sheet is open. The
    // BingeScene selection that powers the reel intentionally
    // omits these fields (they're useless until the user opens
    // the sheet); fetching here keeps the reel's per-slide
    // payload small.
    const [tech, setTech] = useState<SceneFileDetails | null>(null);
    useEffect(() => {
        let alive = true;
        fetchSceneFileDetails(scene.id)
            .then((details) => {
                if (alive) setTech(details);
            })
            .catch(() => {
                /* silent — section just doesn't render */
            });
        return () => {
            alive = false;
        };
    }, [scene.id]);

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
                {tech && <TechSection tech={tech} />}
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

// Drag the sheet up to .large on iOS, scroll further on web —
// either way this section is below the fold for a quick glance.
// Mirrors the iOS SceneDetailsSheet's tech block: path, resolution,
// duration, size, codecs, frame rate, bit rate.
function TechSection({ tech }: { tech: SceneFileDetails }) {
    const rows: { label: string; value: string; mono?: boolean }[] = [];
    if (tech.path) {
        rows.push({ label: "Path", value: tech.path, mono: true });
    }
    const res = formatResolution(tech);
    if (res) rows.push({ label: "Resolution", value: res });
    const dur = formatDuration(tech.duration);
    if (dur) rows.push({ label: "Duration", value: dur });
    const size = formatSize(tech.size);
    if (size) rows.push({ label: "Size", value: size });
    if (tech.video_codec) rows.push({ label: "Video", value: tech.video_codec });
    if (tech.audio_codec) rows.push({ label: "Audio", value: tech.audio_codec });
    const fr = formatFrameRate(tech.frame_rate);
    if (fr) rows.push({ label: "Frame rate", value: fr });
    const br = formatBitRate(tech.bit_rate);
    if (br) rows.push({ label: "Bit rate", value: br });
    if (rows.length === 0) return null;
    return (
        <div className="binge-details-tech">
            <div className="binge-details-tech-heading">TECHNICAL</div>
            <dl className="binge-details-tech-list">
                {rows.map((row) => (
                    <div key={row.label} className="binge-details-tech-row">
                        <dt className="binge-details-tech-label">
                            {row.label}
                        </dt>
                        <dd
                            className={
                                "binge-details-tech-value" +
                                (row.mono ? " is-mono" : "")
                            }
                        >
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function formatResolution(t: SceneFileDetails): string | null {
    if (!t.width || !t.height) return null;
    return `${t.width} × ${t.height}`;
}

// "12:34" or "1:23:45" — same formatter the iOS sheet uses.
function formatDuration(seconds: number | null): string | null {
    if (!seconds || seconds <= 0) return null;
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatSize(bytes: number | null): string | null {
    if (!bytes || bytes <= 0) return null;
    if (bytes >= 1024 ** 3) {
        return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    }
    if (bytes >= 1024 ** 2) {
        return `${Math.round(bytes / 1024 ** 2)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
}

function formatFrameRate(fps: number | null): string | null {
    if (!fps || fps <= 0) return null;
    if (Math.abs(fps - Math.round(fps)) < 0.01) {
        return `${Math.round(fps)} fps`;
    }
    return `${fps.toFixed(2)} fps`;
}

function formatBitRate(bps: number | null): string | null {
    if (!bps || bps <= 0) return null;
    const mbps = bps / 1_000_000;
    if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
    return `${Math.round(bps / 1000)} kbps`;
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
