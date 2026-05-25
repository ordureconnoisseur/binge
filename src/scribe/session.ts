// Resumable interview/result state. Key format matches stash-scribe
// exactly so sessions roundtrip — open a scene in Scribe, close it,
// open the same scene in binge, see the same in-progress interview.

import type { LLMMessage } from "./api";

export interface ScribeSession {
    messages: LLMMessage[];
    generated: { review: string; scores: Record<string, number> } | null;
}

export function sessionKeyForScene(sceneId: string): string {
    return `stashScribe.session.scene.${sceneId}`;
}

export function sessionKeyForPerformer(performerId: string): string {
    return `stashScribe.session.performer.${performerId}`;
}

export function loadSession(key: string): ScribeSession | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.messages)) return null;
        return parsed as ScribeSession;
    } catch {
        return null;
    }
}

export function saveSession(key: string, state: ScribeSession): void {
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
        console.warn("[binge-scribe] session save failed", err);
    }
}

export function clearSession(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}
