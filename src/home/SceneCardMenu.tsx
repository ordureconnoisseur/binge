import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface SceneCardMenuItem {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    // Show a small subtitle/description below the label (e.g.
    // "Open in Stash" → "Opens in a new tab").
    sub?: string;
    // Surface this row in a danger style (red text). Currently
    // unused but keeps the API forward-looking.
    danger?: boolean;
}

interface SceneCardMenuProps {
    items: SceneCardMenuItem[];
}

// Vertical-triple-dot menu pinned to the top-right of feed cards.
// Click toggles a small popover anchored just below the trigger.
// Click outside or Esc dismisses. Portalled to document.body so the
// feed card's overflow:hidden doesn't clip the dropdown.
export function SceneCardMenu({ items }: SceneCardMenuProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(
        null
    );

    useEffect(() => {
        if (!open) return;
        const update = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const menuWidth = menuRef.current?.offsetWidth ?? 220;
            const margin = 8;
            // Anchor below + right-aligned with the trigger.
            const desiredLeft = rect.right - menuWidth;
            const clampedLeft = Math.max(
                margin,
                Math.min(
                    desiredLeft,
                    window.innerWidth - menuWidth - margin
                )
            );
            setPos({
                top: rect.bottom + window.scrollY + 6,
                left: clampedLeft + window.scrollX,
            });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            if (
                menuRef.current?.contains(target) ||
                triggerRef.current?.contains(target)
            ) {
                return;
            }
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("touchstart", onDown, { passive: true });
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("touchstart", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="binge-card-menu-trigger"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="More actions"
                title="More"
            >
                <DotsIcon />
            </button>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        className="binge-card-menu"
                        style={{ top: pos.top, left: pos.left }}
                    >
                        {items.map((item, i) => (
                            <button
                                key={i}
                                type="button"
                                role="menuitem"
                                className={
                                    "binge-card-menu-item" +
                                    (item.danger ? " is-danger" : "")
                                }
                                onClick={() => {
                                    setOpen(false);
                                    item.onClick();
                                }}
                            >
                                {item.icon && (
                                    <span className="binge-card-menu-icon">
                                        {item.icon}
                                    </span>
                                )}
                                <span className="binge-card-menu-text">
                                    <span className="binge-card-menu-label">
                                        {item.label}
                                    </span>
                                    {item.sub && (
                                        <span className="binge-card-menu-sub">
                                            {item.sub}
                                        </span>
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
        </>
    );
}

function DotsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            aria-hidden="true"
        >
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
        </svg>
    );
}
