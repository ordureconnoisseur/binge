import { useTab, type Tab } from "../tabs/TabContext";

// 4-slot fixed bottom nav for mobile viewports (≤720px). Mirrors the
// IG bottom-tab pattern — icons only (no labels), 25%-wide tap
// targets, active slot gets a filled icon variant. Renders nothing
// on Saved + Settings since those tabs have their own back-chevron
// header and a bottom nav over the top would be redundant.

const SLOTS: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "foryou", label: "For You" },
    { id: "explore", label: "Explore" },
    { id: "following", label: "Following" },
    { id: "menu", label: "Menu" },
];

export function BottomNav() {
    const { tab, setTab, tabBarVisible } = useTab();
    if (tab === "saved" || tab === "settings") return null;

    return (
        <nav
            className={
                "binge-bottom-nav" + (tabBarVisible ? "" : " is-hidden")
            }
            role="tablist"
            aria-label="Sections"
        >
            {SLOTS.map((slot) => {
                const active = tab === slot.id;
                return (
                    <button
                        key={slot.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={slot.label}
                        className={
                            "binge-bottom-nav-item" +
                            (active ? " is-active" : "")
                        }
                        onClick={() => setTab(slot.id)}
                    >
                        {iconFor(slot.id, active)}
                    </button>
                );
            })}
        </nav>
    );
}

function iconFor(id: Tab, active: boolean) {
    switch (id) {
        case "home":
            return <HomeIcon filled={active} />;
        case "foryou":
            return <ReelIcon filled={active} />;
        case "explore":
            return <SearchIcon filled={active} />;
        case "following":
            return <UserIcon filled={active} />;
        case "menu":
            return <MenuIcon active={active} />;
        default:
            return null;
    }
}

function MenuIcon({ active }: { active: boolean }) {
    return (
        <svg
            {...ICON_PROPS}
            {...STROKE_PROPS}
            strokeWidth={active ? 2.6 : ICON_STROKE}
        >
            <path d="M 4 6.5 H 20" />
            <path d="M 4 12 H 20" />
            <path d="M 4 17.5 H 20" />
        </svg>
    );
}

// IG-style icon set. Home + Reels + Search circle use SVG paths
// derived from Instagram's actual icons (squircle outlines via
// evenodd-filled compound subpaths). User + Menu are redrawn to
// match the visual weight without being pixel-identical to IG's
// versions. ViewBox 0 0 24 24 throughout, 26px display size.
//
// Outlined state: `fill="currentColor"` + `fill-rule="evenodd"` on
// the compound paths produces a stroke-like outline. Filled (active)
// state: a separate silhouette path with no inner cutout.
const ICON_SIZE = 26;
const ICON_STROKE = 2.2;
const ICON_PROPS = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: ICON_SIZE,
    height: ICON_SIZE,
    "aria-hidden": true as const,
} as const;
const STROKE_PROPS = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};
const EVENODD_FILL = {
    fill: "currentColor",
    fillRule: "evenodd" as const,
};
const SOLID_FILL = { fill: "currentColor" };

// Outlined: outer house silhouette with door arch carved out via a
// second subpath. Filled: same outer silhouette, no door cut-out.
const HOME_OUTLINED =
    "M 21.762 8.786 l -7 -6.68 C 13.266 0.68 10.734 0.68 9.238 2.106 l -7 6.681 A 4.017 4.017 0 0 0 1 11.68 V 20 c 0 1.654 1.346 3 3 3 h 5.005 a 1 1 0 0 0 1 -1 L 10 15 c 0 -1.103 0.897 -2 2 -2 c 1.09 0 1.98 0.877 2 1.962 L 13.999 22 a 1 1 0 0 0 1 1 H 20 c 1.654 0 3 -1.346 3 -3 v -8.32 a 4.021 4.021 0 0 0 -1.238 -2.894 Z M 21 20 a 1 1 0 0 1 -1 1 h -4.001 L 16 15 c 0 -2.206 -1.794 -4 -4 -4 s -4 1.794 -4 4 l 0.005 6 H 4 a 1 1 0 0 1 -1 -1 v -8.32 c 0 -0.543 0.226 -1.07 0.62 -1.447 l 7 -6.68 c 0.747 -0.714 2.013 -0.714 2.76 0 l 7 6.68 c 0.394 0.376 0.62 0.904 0.62 1.448 V 20 Z";
const HOME_FILLED =
    "M 21.762 8.786 l -7 -6.68 a 3.994 3.994 0 0 0 -5.524 0 l -7 6.681 A 4.017 4.017 0 0 0 1 11.68 V 19 c 0 2.206 1.794 4 4 4 h 3.005 a 1 1 0 0 0 1 -1 v -7.003 a 2.997 2.997 0 0 1 5.994 0 V 22 a 1 1 0 0 0 1 1 H 19 c 2.206 0 4 -1.794 4 -4 v -7.32 a 4.02 4.02 0 0 0 -1.238 -2.894 Z";

function HomeIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            {...ICON_PROPS}
            {...(filled ? SOLID_FILL : EVENODD_FILL)}
        >
            <path d={filled ? HOME_FILLED : HOME_OUTLINED} />
        </svg>
    );
}

// Outlined: squircle outline (subpaths 1+2) + play triangle outline
// (subpaths 3+4), evenodd-filled to produce both rings. Filled:
// solid squircle (subpath 1) — the play triangle becomes the icon's
// negative space via a second subpath that's inverted (a triangle
// hole punched out, evenodd).
const REELS_OUTLINED =
    "M 22.935 7.468 c -0.063 -1.36 -0.307 -2.142 -0.512 -2.67 a 5.341 5.341 0 0 0 -1.27 -1.95 a 5.345 5.345 0 0 0 -1.95 -1.27 c -0.53 -0.206 -1.311 -0.45 -2.672 -0.513 C 15.333 1.012 14.976 1 12 1 s -3.333 0.012 -4.532 0.065 c -1.36 0.063 -2.142 0.307 -2.67 0.512 c -0.77 0.298 -1.371 0.69 -1.95 1.27 a 5.36 5.36 0 0 0 -1.27 1.95 c -0.206 0.53 -0.45 1.311 -0.513 2.672 C 1.012 8.667 1 9.024 1 12 s 0.012 3.333 0.065 4.532 c 0.063 1.36 0.307 2.142 0.512 2.67 c 0.297 0.77 0.69 1.372 1.27 1.95 c 0.58 0.581 1.181 0.974 1.95 1.27 c 0.53 0.206 1.311 0.45 2.672 0.513 C 8.667 22.988 9.024 23 12 23 s 3.333 -0.012 4.532 -0.065 c 1.36 -0.063 2.142 -0.307 2.67 -0.512 a 5.33 5.33 0 0 0 1.95 -1.27 a 5.356 5.356 0 0 0 1.27 -1.95 c 0.206 -0.53 0.45 -1.311 0.513 -2.672 c 0.053 -1.198 0.065 -1.555 0.065 -4.531 s -0.012 -3.333 -0.065 -4.532 Z m -1.998 8.972 c -0.05 1.07 -0.228 1.652 -0.38 2.04 c -0.197 0.51 -0.434 0.874 -0.82 1.258 a 3.362 3.362 0 0 1 -1.258 0.82 c -0.387 0.151 -0.97 0.33 -2.038 0.379 c -1.162 0.052 -1.51 0.063 -4.441 0.063 s -3.28 -0.01 -4.44 -0.063 c -1.07 -0.05 -1.652 -0.228 -2.04 -0.38 a 3.354 3.354 0 0 1 -1.258 -0.82 a 3.362 3.362 0 0 1 -0.82 -1.258 c -0.151 -0.387 -0.33 -0.97 -0.379 -2.038 C 3.011 15.28 3 14.931 3 12 s 0.01 -3.28 0.063 -4.44 c 0.05 -1.07 0.228 -1.652 0.38 -2.04 c 0.197 -0.51 0.434 -0.875 0.82 -1.26 a 3.372 3.372 0 0 1 1.258 -0.819 c 0.387 -0.15 0.97 -0.329 2.038 -0.378 C 8.72 3.011 9.069 3 12 3 s 3.28 0.01 4.44 0.063 c 1.07 0.05 1.652 0.228 2.04 0.38 c 0.51 0.197 0.874 0.433 1.258 0.82 c 0.385 0.382 0.622 0.747 0.82 1.258 c 0.151 0.387 0.33 0.97 0.379 2.038 C 20.989 8.72 21 9.069 21 12 s -0.01 3.28 -0.063 4.44 Z m -4.584 -6.828 l -5.25 -3 a 2.725 2.725 0 0 0 -2.745 0.01 A 2.722 2.722 0 0 0 6.988 9 v 6 c 0 0.992 0.512 1.88 1.37 2.379 c 0.432 0.25 0.906 0.376 1.38 0.376 c 0.468 0 0.937 -0.123 1.365 -0.367 l 5.25 -3 c 0.868 -0.496 1.385 -1.389 1.385 -2.388 s -0.517 -1.892 -1.385 -2.388 Z m -0.993 3.04 l -5.25 3 a 0.74 0.74 0 0 1 -0.748 -0.003 a 0.74 0.74 0 0 1 -0.374 -0.649 V 9 a 0.74 0.74 0 0 1 0.374 -0.65 a 0.737 0.737 0 0 1 0.748 -0.002 l 5.25 3 c 0.341 0.196 0.378 0.521 0.378 0.652 s -0.037 0.456 -0.378 0.651 Z";
// Filled: outer squircle silhouette + play triangle hole (the
// triangle subpath winds opposite the outer so evenodd treats it as
// a cutout). Solid squircle with the play cut through it.
const REELS_FILLED =
    "M 22.935 7.468 c -0.063 -1.36 -0.307 -2.142 -0.512 -2.67 a 5.341 5.341 0 0 0 -1.27 -1.95 a 5.345 5.345 0 0 0 -1.95 -1.27 c -0.53 -0.206 -1.311 -0.45 -2.672 -0.513 C 15.333 1.012 14.976 1 12 1 s -3.333 0.012 -4.532 0.065 c -1.36 0.063 -2.142 0.307 -2.67 0.512 c -0.77 0.298 -1.371 0.69 -1.95 1.27 a 5.36 5.36 0 0 0 -1.27 1.95 c -0.206 0.53 -0.45 1.311 -0.513 2.672 C 1.012 8.667 1 9.024 1 12 s 0.012 3.333 0.065 4.532 c 0.063 1.36 0.307 2.142 0.512 2.67 c 0.297 0.77 0.69 1.372 1.27 1.95 c 0.58 0.581 1.181 0.974 1.95 1.27 c 0.53 0.206 1.311 0.45 2.672 0.513 C 8.667 22.988 9.024 23 12 23 s 3.333 -0.012 4.532 -0.065 c 1.36 -0.063 2.142 -0.307 2.67 -0.512 a 5.33 5.33 0 0 0 1.95 -1.27 a 5.356 5.356 0 0 0 1.27 -1.95 c 0.206 -0.53 0.45 -1.311 0.513 -2.672 c 0.053 -1.198 0.065 -1.555 0.065 -4.531 s -0.012 -3.333 -0.065 -4.532 Z M 10 8 v 8 l 6 -4 z";

function ReelIcon({ filled }: { filled: boolean }) {
    return (
        <svg {...ICON_PROPS} {...EVENODD_FILL}>
            <path d={filled ? REELS_FILLED : REELS_OUTLINED} />
        </svg>
    );
}

function SearchIcon({ filled }: { filled: boolean }) {
    // IG's actual circle (your inspected path) + a hand-drawn
    // handle. The handle starts at (19, 19) — past the circle
    // outer-stroke edge (which sits at distance 9.6 from center
    // 10.5,10.5 when stroke=2.2). Starting inside that radius
    // produces a visible bright spot where the two strokes
    // overlap; starting cleanly outside avoids it.
    return (
        <svg
            {...ICON_PROPS}
            {...STROKE_PROPS}
            strokeWidth={filled ? 2.6 : ICON_STROKE}
        >
            <path d="M 19 10.5 A 8.5 8.5 0 1 1 10.5 2 A 8.5 8.5 0 0 1 19 10.5 Z" />
            <path d="M 19 19 L 22 22" />
        </svg>
    );
}

function UserIcon({ filled }: { filled: boolean }) {
    // Head circle + shoulder arc, but the shoulder arc is masked
    // so it doesn't render inside a circular region slightly larger
    // than the head. That eliminates the bright "halo" where the
    // two strokes used to cross at the neck — only one stroke
    // touches any given pixel.
    return (
        <svg
            {...ICON_PROPS}
            {...STROKE_PROPS}
            strokeWidth={filled ? 2.6 : ICON_STROKE}
        >
            <defs>
                <mask id="binge-user-icon-mask">
                    <rect width="24" height="24" fill="white" />
                    <circle cx="12" cy="8.5" r="6" fill="black" />
                </mask>
            </defs>
            <circle cx="12" cy="8.5" r="4.5" />
            <path
                d="M 3.5 21 A 8.5 8.5 0 0 1 20.5 21"
                mask="url(#binge-user-icon-mask)"
            />
        </svg>
    );
}
