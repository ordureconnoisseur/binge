import { useEffect, useRef, type RefObject } from "react";
import { useTab } from "../tabs/TabContext";

// Shared scroll handler behind the chrome on every scrollable tab
// surface: the top strip hides on desktop, the floating bottom nav
// shrinks on mobile. Direction, not activity:
//
//   - Within 80px of the top → always shown, so a feed you have just
//     opened never greets you with shrunken chrome.
//   - Scrolled DOWN past 80px → hidden / contracted, and it stays
//     that way when the flick settles.
//   - Scrolled UP at all (past the deadzone) → shown immediately,
//     wherever in the page you are.
//
// 5px deadzone on both directions filters out iOS rubber-band wobble
// and sub-pixel events that would otherwise flicker the bar. Same
// rules and constants as the iOS app's NavChrome, so the two clients
// behave alike.

const NEAR_TOP_PX = 80;
const DELTA_DEADZONE_PX = 5;

export function useAutoHideTabBar(
    scrollRef: RefObject<HTMLElement | null>,
): void {
    const { setTabBarVisible } = useTab();
    const lastScrollTopRef = useRef(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = () => {
            const current = el.scrollTop;
            const delta = current - lastScrollTopRef.current;
            lastScrollTopRef.current = current;
            if (current < NEAR_TOP_PX) {
                setTabBarVisible(true);
                return;
            }
            if (delta > DELTA_DEADZONE_PX) {
                setTabBarVisible(false);
            } else if (delta < -DELTA_DEADZONE_PX) {
                setTabBarVisible(true);
            }
        };
        // Prime the state to match the current scroll position on mount.
        lastScrollTopRef.current = el.scrollTop;
        handler();
        el.addEventListener("scroll", handler, { passive: true });
        return () => el.removeEventListener("scroll", handler);
    }, [scrollRef, setTabBarVisible]);
}
