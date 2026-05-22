import type { Story as StoryData } from "./useStories";

interface StoryProps {
    story: StoryData;
    onClick: (story: StoryData) => void;
}

// Single story circle — performer avatar wrapped in the IG-style gradient
// ring + name underneath. The ring is purely cosmetic for v0 (every story
// in the list has new content by construction); a "viewed" muted variant
// is a future addition.
export function Story({ story, onClick }: StoryProps) {
    const { performerName, performerImagePath } = story;
    const newCount = story.scenes.length;
    return (
        <button
            type="button"
            className={
                "binge-story" +
                (story.performerFavorite ? " is-favorite" : "")
            }
            onClick={() => onClick(story)}
            title={`${performerName} — ${newCount} new`}
            aria-label={`${performerName}, ${newCount} new ${
                newCount === 1 ? "scene" : "scenes"
            }`}
        >
            <span className="binge-story-ring">
                <span
                    className="binge-story-avatar"
                    style={
                        performerImagePath
                            ? {
                                  backgroundImage: `url(${performerImagePath})`,
                              }
                            : undefined
                    }
                >
                    {!performerImagePath && (
                        <span className="binge-story-initial">
                            {performerName.charAt(0).toUpperCase()}
                        </span>
                    )}
                </span>
            </span>
            <span className="binge-story-name">{performerName}</span>
        </button>
    );
}
