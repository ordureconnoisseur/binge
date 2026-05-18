import type { BingeScene } from "../api/queries";
import type { TranscodeType } from "../config";

// Map a user's transcode preference to a stream URL. The available endpoints
// vary per Stash install (depends on the user's transcode config), so we
// match by label/mime substring and fall back to paths.stream when there's
// no match — that field is the one Stash itself negotiates.
//
// Labels from Stash typically look like: "Direct stream", "MP4", "WEBM",
// "HLS". We do case-insensitive substring matching against label first,
// then mime_type as a fallback.
export function pickStreamUrl(
    scene: BingeScene,
    preference: TranscodeType
): string {
    if (preference === "auto") return scene.paths.stream;

    const streams = scene.sceneStreams ?? [];
    const match = streams.find((s) => matches(s.label, s.mime_type, preference));
    return match?.url ?? scene.paths.stream;
}

function matches(
    label: string | null,
    mime: string | null,
    pref: TranscodeType
): boolean {
    const l = (label ?? "").toLowerCase();
    const m = (mime ?? "").toLowerCase();
    switch (pref) {
        case "direct":
            return l.includes("direct");
        case "mp4":
            return (l.includes("mp4") && !l.includes("direct")) || m === "video/mp4";
        case "webm":
            return l.includes("webm") || m === "video/webm";
        case "hls":
            return l.includes("hls") || m.includes("mpegurl") || m.includes("x-mpegurl");
        default:
            return false;
    }
}
