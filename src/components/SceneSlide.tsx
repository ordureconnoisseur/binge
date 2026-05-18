import { useEffect, useRef, useState } from "react";
import type { BingeScene } from "../api/queries";
import { ActionStack } from "./ActionStack";
import { PerformerRow } from "./PerformerRow";
import { pickStreamUrl } from "../util/pickStream";
import { getTranscodeType } from "../config";

interface SceneSlideProps {
    scene: BingeScene;
    // Whether this slide should aggressively buffer (preload="auto"). The
    // Reel sets this true for the current slide + the next 2 so navigation
    // doesn't stall; remaining slides only preload metadata.
    preload?: "auto" | "metadata" | "none";
    // Called when this slide becomes the dominant intersecting one (>= 0.6).
    // Used by the parent Reel to track activeIndex for preload decisions.
    onActive?: (sceneId: string) => void;
}

// One slide of the reel. Owns:
//   - its <video> element
//   - an IntersectionObserver that plays when on-screen and pauses off-screen
//   - the overlay (title, performers, tags)
//
// Why each slide owns its own observer instead of a parent-managed "current
// index": scroll-snap doesn't guarantee a single visible item at the moment
// of snap; with one observer per slide we get clean transitions even mid-snap.
export function SceneSlide({
    scene,
    preload = "metadata",
    onActive,
}: SceneSlideProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const active = entry.intersectionRatio >= 0.6;
                    setIsActive(active);
                    if (active) {
                        onActive?.(scene.id);
                        // Muted autoplay is the only reliable autoplay path
                        // without a user gesture in evergreen browsers.
                        video.muted = true;
                        void video.play().catch(() => {
                            // Autoplay block — leave paused; user can tap.
                        });
                    } else {
                        video.pause();
                    }
                }
            },
            { threshold: [0, 0.6, 1] }
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [scene.id, onActive]);

    const displayTitle =
        scene.title || scene.performers.map((p) => p.name).join(", ") || `Scene ${scene.id}`;

    return (
        <article
            ref={containerRef}
            className="binge-slide"
            data-scene-id={scene.id}
            data-active={isActive ? "true" : "false"}
        >
            <video
                ref={videoRef}
                className="binge-video"
                src={pickStreamUrl(scene, getTranscodeType())}
                poster={scene.paths.screenshot}
                preload={preload}
                playsInline
                loop
                muted
                controls
            />
            <div className="binge-overlay">
                <PerformerRow performers={scene.performers} />
                <h2 className="binge-title">{displayTitle}</h2>
                {scene.studio && (
                    <p className="binge-studio">{scene.studio.name}</p>
                )}
            </div>
            <ActionStack scene={scene} />
        </article>
    );
}
