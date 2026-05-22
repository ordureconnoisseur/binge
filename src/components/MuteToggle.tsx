interface MuteToggleProps {
    muted: boolean;
    onToggle: () => void;
}

// Top-right mute pill. Instagram-style: speaker-with-waves when audio is
// playing, speaker-X (or slash) when muted. Click toggles globally —
// see [useMuteState] — so all subsequent slides honor the choice.
export function MuteToggle({ muted, onToggle }: MuteToggleProps) {
    return (
        <button
            type="button"
            className="binge-mute-toggle"
            onClick={(e) => {
                // Prevent the tap-to-pause overlay from also receiving the click.
                e.stopPropagation();
                onToggle();
            }}
            title={muted ? "Unmute" : "Mute"}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={!muted}
        >
            {muted ? <MutedIcon /> : <UnmutedIcon />}
        </button>
    );
}

export function UnmutedIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="1.1em"
            height="1.1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
    );
}

export function MutedIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="1.1em"
            height="1.1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
    );
}
