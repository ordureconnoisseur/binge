import { useTab } from "./TabContext";

// "More" page reached via the bottom-nav burger slot on mobile. Just
// a thin list page that hosts entries to Saved + Settings — the
// hidden tabs that need their own surface but don't justify a
// dedicated bottom-nav slot.
//
// On desktop this page is unreachable via the nav (the burger lives
// in the top header as a dropdown there) but it stays valid as a
// route — direct-linking `#/menu` still works.
export function MenuPage() {
    const { setTab } = useTab();
    return (
        <div className="binge-tab-scroll">
            <header className="binge-saved-header">
                <span className="binge-saved-spacer" />
                <h1 className="binge-saved-title">More</h1>
                <span className="binge-saved-spacer" />
            </header>
            <ul className="binge-menu-list">
                <li>
                    <button
                        type="button"
                        className="binge-menu-row"
                        onClick={() => setTab("saved")}
                    >
                        <span className="binge-menu-row-icon" aria-hidden="true">
                            <BookmarkIcon />
                        </span>
                        <span className="binge-menu-row-text">
                            <span className="binge-menu-row-title">
                                Saved
                            </span>
                            <span className="binge-menu-row-desc">
                                Custom collections of bookmarked scenes.
                            </span>
                        </span>
                        <span
                            className="binge-menu-row-chev"
                            aria-hidden="true"
                        >
                            <ChevronRight />
                        </span>
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        className="binge-menu-row"
                        onClick={() => setTab("settings")}
                    >
                        <span className="binge-menu-row-icon" aria-hidden="true">
                            <GearIcon />
                        </span>
                        <span className="binge-menu-row-text">
                            <span className="binge-menu-row-title">
                                Settings
                            </span>
                            <span className="binge-menu-row-desc">
                                Stream type, lookback window, binge-server
                                configuration, theme integration.
                            </span>
                        </span>
                        <span
                            className="binge-menu-row-chev"
                            aria-hidden="true"
                        >
                            <ChevronRight />
                        </span>
                    </button>
                </li>
            </ul>
        </div>
    );
}

function BookmarkIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function GearIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}
