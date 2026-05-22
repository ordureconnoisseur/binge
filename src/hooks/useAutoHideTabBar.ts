import { useEffect, useRef, type RefObject } from "react";
import { useTab } from "../tabs/TabContext";

// Shared scroll handler that drives the top tab/header auto-hide on
// every scrollable tab surface. Behaviour:
//
//   - Within 80px of the top → always shown.
//   - Scrolled DOWN past 80px → hidden.
//   - Scrolled UP at all (past the deadzone) → shown immediately,
//     wherever in the page you are.
//
// 5px deadzone on both directions filters out iOS rubber-band wobble
// and sub-pixel events that would otherwise flicker the bar.

const NEAR_TOP_PX = 80;
const DELTA_DEADZONE_PX = 5;

export function useAutoHideTabBar(
    scrollRef: RefObject<HTMLElement | null>
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
