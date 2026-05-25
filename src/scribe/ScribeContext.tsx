import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { ScribeModal } from "./ScribeModal";
import type { SubjectRef } from "./subject";

interface ScribeContextValue {
    openScene: (sceneId: string) => void;
    openPerformer: (performerId: string) => void;
}

const ScribeContext = createContext<ScribeContextValue | null>(null);

export function ScribeProvider({ children }: { children: ReactNode }) {
    const [subject, setSubject] = useState<SubjectRef | null>(null);

    const openScene = useCallback(
        (id: string) => setSubject({ kind: "scene", id }),
        []
    );
    const openPerformer = useCallback(
        (id: string) => setSubject({ kind: "performer", id }),
        []
    );
    const close = useCallback(() => setSubject(null), []);

    const value = useMemo<ScribeContextValue>(
        () => ({ openScene, openPerformer }),
        [openScene, openPerformer]
    );

    return (
        <ScribeContext.Provider value={value}>
            {children}
            {subject && <ScribeModal subject={subject} onClose={close} />}
        </ScribeContext.Provider>
    );
}

export function useScribeModal(): ScribeContextValue {
    const ctx = useContext(ScribeContext);
    if (!ctx) {
        // Defensive — no-op so a missing provider doesn't crash.
        return { openScene: () => {}, openPerformer: () => {} };
    }
    return ctx;
}
