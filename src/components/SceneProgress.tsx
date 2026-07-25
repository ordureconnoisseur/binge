import { useEffect, useRef, useState, type RefObject } from "react";

interface SceneProgressProps {
    videoRef: RefObject<HTMLVideoElement | null>;
    // Authoritative duration from Stash's database (scene.files[0].duration).
    // Far more reliable than video.duration, which is `Infinity`/NaN for
    // progressive transcoded streams until the whole file has loaded.
    duration: number | null;
    // 需求2：自定义 seek 回调。提供时由父组件（SceneSlide）决定 seek 方式：
    //   - web 兼容容器（mp4/webm/...）：直接设 video.currentTime（原生 seek）
    //   - 转码容器（avi/wmv/mkv/...）：重建 src 带 ?start=N（硬 seek）
    // 不提供时回退到原生 video.currentTime = N（向后兼容）。
    onSeekToTime?: (time: number) => void;
    // 转码硬 seek 偏移量。硬 seek 用 ?start=N 重建 src 后，新流的
    // video.currentTime 从 0 重新计起（ffmpeg 重置时间戳），因此进度条
    // 需要按 (currentTime + seekOffset) / duration 计算真实进度，否则
    // seek 后进度条会瞬间跳回 0。原生流/web 兼容容器偏移量为 0。
    seekOffset?: number;
}

// Thin Instagram-style progress bar. Pinned to the bottom of the slide,
// 2px tall by default, expands slightly on hover. Drawn against Stash's
// known duration so it shows real progress through a 2-hour scene, not
// just how far the buffer has loaded.
export function SceneProgress({
    videoRef,
    duration,
    onSeekToTime,
    seekOffset = 0,
}: SceneProgressProps) {
    const [progress, setProgress] = useState(0);
    const [hovering, setHovering] = useState(false);
    // 用 ref 镜像 seekOffset：事件监听器只绑定一次，每次触发时从 ref
    // 读取最新值。避免 seekOffset 变化时旧监听器（闭包固定了旧值 0）
    // 在 React 重新绑定前抢先触发 timeupdate，把进度条瞬间重置为 0。
    const seekOffsetRef = useRef(seekOffset);
    seekOffsetRef.current = seekOffset;

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handle = () => {
            // 转码硬 seek 后新流的 currentTime 从 0 计起，需加上偏移量
            // 才能得到在整段视频中的真实位置。
            const t = video.currentTime + seekOffsetRef.current;
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
        const targetTime = ratio * d;
        // 需求2：优先用父组件提供的 seek 回调（转码流走硬 seek 路径）。
        // 无回调时回退到原生 currentTime 赋值。
        if (onSeekToTime) {
            onSeekToTime(targetTime);
        } else {
            video.currentTime = targetTime;
        }
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
            aria-label="场景进度"
        >
            <div
                className="binge-progress-fill"
                style={{ transform: `scaleX(${progress})` }}
            />
        </div>
    );
}
