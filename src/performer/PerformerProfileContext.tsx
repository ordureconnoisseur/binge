import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

// Lets any descendant of <PerformerProfileProvider> summon the full-screen
// performer page without prop drilling. The actual rendering lives in
// <PerformerProfile/>, which reads `currentProfile` and portals itself to body.
//
// The profile is mirrored to the URL hash so the browser back button closes
// it, and direct deep-links work on first paint. Two hash shapes:
//   - `#/p/<localId>`   library performer (existing)
//   - `#/sdbp/<stashId>` StashDB-only performer (NEW — not in the user's
//                        Stash library yet; profile renders from StashDB
//                        data + their StashDB scenes)
export type ProfileTarget =
    | { kind: "local"; id: string }
    | { kind: "stashdb"; id: string };

interface PerformerProfileContextValue {
    currentProfile: ProfileTarget | null;
    openProfile: (id: string) => void;
    openStashDBProfile: (stashId: string) => void;
    close: () => void;
}

const PerformerProfileContext = createContext<
    PerformerProfileContextValue | undefined
>(undefined);

const LOCAL_HASH_PATTERN = /^#\/p\/([^/?]+)/;
const STASHDB_HASH_PATTERN = /^#\/sdbp\/([^/?]+)/;

function readProfileFromHash(): ProfileTarget | null {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    const stashdbMatch = hash.match(STASHDB_HASH_PATTERN);
    if (stashdbMatch) {
        return { kind: "stashdb", id: decodeURIComponent(stashdbMatch[1]) };
    }
    const localMatch = hash.match(LOCAL_HASH_PATTERN);
    if (localMatch) {
        return { kind: "local", id: decodeURIComponent(localMatch[1]) };
    }
    return null;
}

function writeProfileHash(target: ProfileTarget): void {
    if (typeof window === "undefined") return;
    const prefix = target.kind === "stashdb" ? "sdbp" : "p";
    const next = `#/${prefix}/${encodeURIComponent(target.id)}`;
    if (window.location.hash === next) return;
    window.history.pushState(null, "", next);
}

export function PerformerProfileProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [currentProfile, setCurrentProfile] = useState<ProfileTarget | null>(
        () => readProfileFromHash()
    );

    useEffect(() => {
        const onHashChange = () => {
            setCurrentProfile(readProfileFromHash());
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    const openProfile = useCallback((id: string) => {
        const target: ProfileTarget = { kind: "local", id };
        writeProfileHash(target);
        setCurrentProfile(target);
    }, []);

    const openStashDBProfile = useCallback((stashId: string) => {
        const target: ProfileTarget = { kind: "stashdb", id: stashId };
        writeProfileHash(target);
        setCurrentProfile(target);
    }, []);

    const close = useCallback(() => {
        if (readProfileFromHash()) {
            window.history.back();
        } else {
            setCurrentProfile(null);
        }
    }, []);

    return (
        <PerformerProfileContext.Provider
            value={{
                currentProfile,
                openProfile,
                openStashDBProfile,
                close,
            }}
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
