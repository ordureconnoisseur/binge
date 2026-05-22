import { useEffect, useState } from "react";

// Single-breakpoint mobile detection. Same media-query string used by
// the responsive CSS in global.css so React state and CSS rules
// switch in lockstep — no awkward middle-zone where the bottom nav
// is showing but content still has desktop top-padding (or vice
// versa).
//
// 720px is the existing breakpoint binge already uses elsewhere (the
// story viewer's narrow-viewport rules, the chip-row's pointer-coarse
// rules). Keep it consistent rather than introducing a new one.
const MOBILE_QUERY = "(max-width: 720px)";

export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(MOBILE_QUERY).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mql = window.matchMedia(MOBILE_QUERY);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    return isMobile;
}
