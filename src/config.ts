// Shared config keys. The settings panel (in binge.entry.js, running in
// the Stash main SPA) writes these to localStorage; the reel SPA (this
// iframe) reads them on load. Same-origin → same storage.

export const TRANSCODE_STORAGE_KEY = "binge.transcodeType";

export type TranscodeType = "auto" | "direct" | "mp4" | "webm" | "hls";

export function getTranscodeType(): TranscodeType {
    try {
        const raw = localStorage.getItem(TRANSCODE_STORAGE_KEY);
        if (
            raw === "auto" ||
            raw === "direct" ||
            raw === "mp4" ||
            raw === "webm" ||
            raw === "hls"
        ) {
            return raw;
        }
    } catch {
        // Storage blocked — fall through to default.
    }
    return "auto";
}
