import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { Story } from "./useStories";

// Lets the StoriesRow (or any descendant) summon the IG-style story
// viewer without prop-drilling. State shape mirrors how
// PerformerProfileContext works for the performer-profile modal:
// provider lives in App; the actual <StoryViewer/> is mounted as a
// sibling and portals to body when isOpen.
interface StoryViewerContextValue {
    isOpen: boolean;
    stories: Story[];
    activeIndex: number;
    open: (stories: Story[], startIndex: number) => void;
    close: () => void;
    setActiveIndex: (i: number) => void;
}

const StoryViewerContext = createContext<StoryViewerContextValue | undefined>(
    undefined
);

export function StoryViewerProvider({ children }: { children: ReactNode }) {
    const [stories, setStories] = useState<Story[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback((next: Story[], startIndex: number) => {
        setStories(next);
        setActiveIndex(Math.max(0, Math.min(startIndex, next.length - 1)));
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        // Keep stories around for the fade-out transition; cleared next
        // time the viewer opens. Avoids a flash of empty-state.
    }, []);

    const value = useMemo<StoryViewerContextValue>(
        () => ({ isOpen, stories, activeIndex, open, close, setActiveIndex }),
        [isOpen, stories, activeIndex, open, close]
    );

    return (
        <StoryViewerContext.Provider value={value}>
            {children}
        </StoryViewerContext.Provider>
    );
}

export function useStoryViewer(): StoryViewerContextValue {
    const ctx = useContext(StoryViewerContext);
    if (!ctx) {
        throw new Error(
            "useStoryViewer must be used within StoryViewerProvider"
        );
    }
    return ctx;
}
