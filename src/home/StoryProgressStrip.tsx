interface StoryProgressStripProps {
    sceneCount: number;
    currentIndex: number;
    // 0..1 fill of the active segment. Driven externally — the viewer
    // ticks this via requestAnimationFrame so we don't double-own time.
    progress: number;
}

// The thin IG-style top progress strip. One segment per scene in the
// focused performer's stories; segments before `currentIndex` are 100%
// filled, the current one animates to `progress`, segments after are
// empty.
export function StoryProgressStrip({
    sceneCount,
    currentIndex,
    progress,
}: StoryProgressStripProps) {
    const segments: number[] = [];
    for (let i = 0; i < sceneCount; i++) {
        segments.push(
            i < currentIndex ? 1 : i === currentIndex ? progress : 0
        );
    }
    return (
        <div className="binge-story-viewer-progress" aria-hidden="true">
            {segments.map((fill, i) => (
                <div key={i} className="binge-story-viewer-progress-segment">
                    <div
                        className="binge-story-viewer-progress-fill"
                        style={{ transform: `scaleX(${fill})` }}
                    />
                </div>
            ))}
        </div>
    );
}
