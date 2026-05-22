import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

// Lets any descendant of <PerformerProfileProvider> summon the full-screen
// performer page without prop drilling. The actual rendering lives in
// <PerformerProfile/>, which reads `currentId` and portals itself to body.
//
// The profile is mirrored to the URL hash (`#/p/<id>`) so the browser
// back button closes it, and direct deep-links work on first paint.
// The tab hash (`#/home`, `#/foryou`, …) and the profile hash share the
// same fragment — opening a profile pushes a new history entry on top
// of the current tab, and back pops to that tab.
interface PerformerProfileContextValue {
    currentId: string | null;
    openProfile: (id: string) => void;
    close: () => void;
}

const PerformerProfileContext = createContext<
    PerformerProfileContextValue | undefined
>(undefined);

const PROFILE_HASH_PATTERN = /^#\/p\/([^/?]+)/;

function readProfileIdFromHash(): string | null {
    if (typeof window === "undefined") return null;
    const m = window.location.hash.match(PROFILE_HASH_PATTERN);
    return m ? decodeURIComponent(m[1]) : null;
}

function writeProfileHash(id: string): void {
    if (typeof window === "undefined") return;
    const next = `#/p/${encodeURIComponent(id)}`;
    if (window.location.hash === next) return;
    window.history.pushState(null, "", next);
}

export function PerformerProfileProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    // Initial state honours a direct deep-link such as
    // .../index.html#/p/823 — opens that performer on first paint.
    const [currentId, setCurrentId] = useState<string | null>(() =>
        readProfileIdFromHash()
    );

    // Browser back / forward → sync. When the user pops the profile
    // entry off the history stack we set currentId back to null and
    // PerformerProfile unmounts itself.
    useEffect(() => {
        const onHashChange = () => {
            setCurrentId(readProfileIdFromHash());
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    const openProfile = useCallback((id: string) => {
        writeProfileHash(id);
        setCurrentId(id);
    }, []);

    const close = useCallback(() => {
        if (readProfileIdFromHash()) {
            // Pop the profile entry — the hashchange listener will
            // clear `currentId` once the hash settles.
            window.history.back();
        } else {
            setCurrentId(null);
        }
    }, []);
    return (
        <PerformerProfileContext.Provider
            value={{ currentId, openProfile, close }}
        >
            {children}
        </PerformerProfileContext.Provider>
    );
}

export function usePerformerProfile() {
    const ctx = useContext(PerformerProfileContext);
    if (!ctx) {
        throw new Error(
            "usePerformerProfile must be used within PerformerProfileProvider"
        );
    }
    return ctx;
}
