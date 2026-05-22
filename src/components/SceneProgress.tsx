import { useEffect, useState, type RefObject } from "react";

interface SceneProgressProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    // Authoritative duration from Stash's database (scene.files[0].duration).
    // Far more reliable than video.duration, which is `Infinity`/NaN for
    // progressive transcoded streams until the whole file has loaded.
    duration: number | null;
}

// Thin Instagram-style progress bar. Pinned to the bottom of the slide,
// 2px tall by default, expands slightly on hover. Drawn against Stash's
// known duration so it shows real progress through a 2-hour scene, not
// just how far the buffer has loaded.
export function SceneProgress({ videoRef, duration }: SceneProgressProps) {
    const [progress, setProgress] = useState(0);
    const [hovering, setHovering] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handle = () => {
            const t = video.currentTime;
            const d =
                duration && duration > 0
                    ? duration
                    : Number.isFinite(video.duration)
                      ? video.duration
                      : 0;
            if (d > 0) {
                setProgress(Math.min(1, t / d));
            }
        };
        video.addEventListener("timeupdate", handle);
        video.addEventListener("seeked", handle);
        return () => {
            video.removeEventListener("timeupdate", handle);
            video.removeEventListener("seeked", handle);
        };
    }, [videoRef, duration]);

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current;
        if (!video) return;
        const d =
            duration && duration > 0
                ? duration
                : Number.isFinite(video.duration)
                  ? video.duration
                  : 0;
        if (d <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = ratio * d;
        setProgress(ratio);
    };

    return (
        <div
            className={
                "binge-progress" + (hovering ? " is-hovering" : "")
            }
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onClick={handleSeek}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={progress}
            aria-label="Scene progress"
        >
            <div
                className="binge-progress-fill"
                style={{ transform: `scaleX(${progress})` }}
            />
        </div>
    );
}
