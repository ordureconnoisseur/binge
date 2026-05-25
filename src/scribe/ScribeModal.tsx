import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Criterion } from "../rating/types";
import {
    callLLM,
    getScribeConfig,
    parseGenerated,
    type LLMMessage,
    type ScribeConfig,
} from "./api";
import {
    VOICE_LABELS,
    VOICE_MODES,
    type VoiceMode,
} from "./prompts";
import { clearSession, loadSession, saveSession } from "./session";
import { loadSubject, type LoadedSubject, type SubjectRef } from "./subject";

// "intro" — choice screen when there's no existing review + no
//          resumable session. User picks LLM-interview or manual.
//          Avoids hitting Ollama until the user opts in (so the
//          modal is safe to open even when Ollama is offline).
type Phase = "loading" | "intro" | "interview" | "result" | "error";

interface LoadedState {
    subject: LoadedSubject;
    config: ScribeConfig;
}

interface Generated {
    review: string;
    scores: Record<string, number>;
}

function buildFreshSystem(
    loaded: LoadedState,
    tone: VoiceMode
): LLMMessage {
    const voice = loaded.config.voicePrompts[tone];
    const criteria = loaded.subject.criteria;
    const criteriaBlock =
        criteria.length > 0
            ? "Rating criteria (referenced during interview, scored at end):\n" +
              criteria.map((c) => `- ${c.name}`).join("\n") +
              "\n\n"
            : "";
    const voiceReminder = `REMINDER: Stay strictly in the voice set above (${VOICE_LABELS[tone]} mode).\n\n`;
    const contextLabel =
        loaded.subject.kind === "performer" ? "Performer" : "Scene";
    return {
        role: "system",
        content:
            `${voice}\n\n` +
            `${contextLabel} context:\n${loaded.subject.contextForLLM}\n\n` +
            criteriaBlock +
            `${loaded.subject.interviewContract}\n\n` +
            voiceReminder,
    };
}

export function ScribeModal({
    subject: subjectRef,
    onClose,
}: {
    subject: SubjectRef;
    onClose: () => void;
}) {
    const [phase, setPhase] = useState<Phase>("loading");
    const [loaded, setLoaded] = useState<LoadedState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tone, setTone] = useState<VoiceMode>("filthy");
    const [messages, setMessages] = useState<LLMMessage[]>([]);
    const [userInput, setUserInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyMsg, setBusyMsg] = useState("");
    const [reviewText, setReviewText] = useState("");
    const [scores, setScores] = useState<Record<string, number>>({});
    const [editMode, setEditMode] = useState(false);
    const transcriptRef = useRef<HTMLDivElement>(null);

    // Load subject + config; decide entry phase based on existing
    // session OR existing saved review. Subject-agnostic — works
    // for both scenes and performers since the heavy lifting moved
    // into loadSubject().
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [subject, config] = await Promise.all([
                    loadSubject(subjectRef),
                    getScribeConfig(),
                ]);
                if (!alive) return;
                if (!subject) {
                    setError(
                        subjectRef.kind === "performer"
                            ? "Performer not found"
                            : "Scene not found"
                    );
                    setPhase("error");
                    return;
                }
                const next: LoadedState = { subject, config };
                setTone(config.defaultTone);
                setLoaded(next);

                const saved = loadSession(subject.sessionKey);
                const hasResumeableInterview =
                    saved &&
                    Array.isArray(saved.messages) &&
                    saved.messages.length >= 2;

                if (hasResumeableInterview) {
                    setMessages(saved.messages);
                    if (saved.generated) {
                        setReviewText(saved.generated.review);
                        setScores(saved.generated.scores);
                        setPhase("result");
                    } else {
                        setPhase("interview");
                    }
                } else if (subject.existingReview) {
                    setEditMode(true);
                    setReviewText(subject.existingReview);
                    setScores(subject.initialScores);
                    setPhase("result");
                } else {
                    // Fresh open: show intro screen with LLM-vs-manual
                    // choice rather than auto-firing the LLM. Keeps
                    // the modal usable when Ollama is offline.
                    setPhase("intro");
                }
            } catch (e) {
                if (!alive) return;
                setError(friendlyError(e));
                setPhase("error");
            }
        })();
        return () => {
            alive = false;
        };
    }, [subjectRef.kind, subjectRef.id]);

    // Auto-scroll the transcript to the bottom as messages arrive.
    useEffect(() => {
        const el = transcriptRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages]);

    const userExchangeCount = messages.filter((m) => m.role === "user").length;
    const canGenerate = userExchangeCount >= 1 && !busy;

    const persist = useCallback(
        (msgs: LLMMessage[], gen: Generated | null) => {
            if (!loaded) return;
            saveSession(loaded.subject.sessionKey, {
                messages: msgs,
                generated: gen,
            });
        },
        [loaded]
    );

    // Fires the first LLM call to seed the interview. Shared by the
    // intro screen's "Start LLM interview" button, the Start-over
    // path, and the edit→interview transition. Sets error state but
    // doesn't itself unset busy on a "kickoff failure → user retries"
    // path — that's the modal's job via the catch block.
    const runKickoff = useCallback(
        async (sys: LLMMessage) => {
            if (!loaded) return;
            setBusy(true);
            setBusyMsg("Starting interview…");
            setError(null);
            try {
                const reply = await callLLM(
                    [
                        sys,
                        {
                            role: "user",
                            content:
                                "Begin the interview with your first question.",
                        },
                    ],
                    loaded.config
                );
                const updated: LLMMessage[] = [
                    sys,
                    { role: "assistant", content: reply },
                ];
                setMessages(updated);
                saveSession(loaded.subject.sessionKey, {
                    messages: updated,
                    generated: null,
                });
            } catch (e) {
                setError(friendlyError(e));
            } finally {
                setBusy(false);
                setBusyMsg("");
            }
        },
        [loaded]
    );

    const startLLMInterview = useCallback(() => {
        if (!loaded) return;
        const sys = buildFreshSystem(loaded, tone);
        setMessages([sys]);
        setPhase("interview");
        void runKickoff(sys);
    }, [loaded, tone, runKickoff]);

    const startManual = useCallback(() => {
        if (!loaded) return;
        setEditMode(true);
        setReviewText("");
        setScores({});
        setPhase("result");
    }, [loaded]);

    const sendMessage = useCallback(async () => {
        if (!loaded || busy) return;
        const text = userInput.trim();
        if (!text) return;
        const next = [...messages, { role: "user", content: text } as LLMMessage];
        setMessages(next);
        setUserInput("");
        persist(next, null);
        setBusy(true);
        setBusyMsg("Talking to the LLM…");
        try {
            const reply = await callLLM(next, loaded.config);
            const after: LLMMessage[] = [
                ...next,
                { role: "assistant", content: reply },
            ];
            setMessages(after);
            persist(after, null);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setBusy(false);
            setBusyMsg("");
        }
    }, [loaded, busy, userInput, messages, persist]);

    const generate = useCallback(async () => {
        if (!loaded || busy || !canGenerate) return;
        setBusy(true);
        setBusyMsg("Writing the review…");
        setError(null);
        try {
            const criteriaList =
                loaded.subject.criteria.length > 0
                    ? "Criteria to score (give an integer 0–5 for each):\n" +
                      loaded.subject.criteria.map((c) => `- ${c.name}`).join("\n")
                    : "No rating criteria configured — output the REVIEW section only and skip SCORES.";
            const genMessages: LLMMessage[] = [
                ...messages,
                {
                    role: "system",
                    content:
                        loaded.subject.reviewContract +
                        "\n\n" +
                        criteriaList,
                },
                { role: "user", content: "Generate the review now." },
            ];
            const reply = await callLLM(genMessages, loaded.config);
            const parsed = parseGenerated(reply, loaded.subject.criteria);
            setReviewText(parsed.review);
            setScores(parsed.scores);
            persist(messages, {
                review: parsed.review,
                scores: parsed.scores,
            });
            setPhase("result");
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setBusy(false);
            setBusyMsg("");
        }
    }, [loaded, busy, canGenerate, messages, persist]);

    const backToInterview = useCallback(() => {
        if (!loaded) return;
        if (editMode) {
            if (
                !confirm(
                    "Discard this edit and start a fresh interview? The currently saved review stays on the scene until you save a new one."
                )
            )
                return;
            clearSession(loaded.subject.sessionKey);
            setEditMode(false);
            const sys = buildFreshSystem(loaded, tone);
            setMessages([sys]);
            setReviewText("");
            setScores({});
            setPhase("interview");
            void runKickoff(sys);
            return;
        }
        setPhase("interview");
        persist(messages, null);
    }, [loaded, editMode, tone, messages, persist, runKickoff]);

    const startOver = useCallback(() => {
        if (!loaded) return;
        if (
            !confirm(
                "Discard this interview/draft? Saved reviews on the scene are not touched."
            )
        )
            return;
        clearSession(loaded.subject.sessionKey);
        setEditMode(false);
        setReviewText("");
        setScores({});
        // Drop back to the intro screen so the user can pick LLM
        // vs manual fresh — same choice they had on first open.
        setMessages([]);
        setPhase("intro");
    }, [loaded]);

    const save = useCallback(
        async (withScores: boolean) => {
            if (!loaded || busy) return;
            setBusy(true);
            setBusyMsg("Saving…");
            setError(null);
            try {
                await loaded.subject.save({
                    reviewText,
                    scoresByCriterion: withScores ? scores : {},
                    autoCreate: loaded.config.autoCreateTags,
                });
                clearSession(loaded.subject.sessionKey);
                setBusyMsg("Saved.");
                setTimeout(() => onClose(), 600);
            } catch (e) {
                setError(friendlyError(e));
                setBusy(false);
                setBusyMsg("");
            }
        },
        [loaded, busy, reviewText, scores, onClose]
    );

    return createPortal(
        <div className="binge-sheet-root binge-sheet-root-top">
            <div className="binge-sheet-backdrop" onClick={onClose} />
            <div
                className="binge-sheet binge-scribe-modal"
                role="dialog"
                aria-label="Stash Scribe"
            >
                <div className="binge-scribe-header">
                    <div className="binge-scribe-title-row">
                        <h2 className="binge-scribe-title">Stash Scribe</h2>
                        {loaded?.subject.contextStrip && (
                            <span className="binge-scribe-strip">
                                {loaded.subject.contextStrip}
                            </span>
                        )}
                    </div>
                    <div className="binge-scribe-header-actions">
                        {phase === "interview" && (
                            <select
                                className="binge-scribe-tone"
                                value={tone}
                                onChange={(e) =>
                                    setTone(e.target.value as VoiceMode)
                                }
                                title="Voice tone — takes effect on the next message"
                            >
                                {VOICE_MODES.map((v) => (
                                    <option key={v} value={v}>
                                        {VOICE_LABELS[v]}
                                    </option>
                                ))}
                            </select>
                        )}
                        {(phase === "interview" || phase === "result") && (
                            <button
                                type="button"
                                className="binge-scribe-restart"
                                onClick={startOver}
                                title="Discard this session and start a fresh interview"
                            >
                                Start over
                            </button>
                        )}
                        <button
                            type="button"
                            className="binge-scribe-close"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="binge-scribe-error" role="alert">
                        {error}
                    </div>
                )}

                {phase === "loading" && (
                    <div className="binge-scribe-status">Loading scene…</div>
                )}

                {phase === "error" && !loaded && (
                    <div className="binge-scribe-status">{error}</div>
                )}

                {phase === "intro" && loaded && (
                    <div className="binge-scribe-intro">
                        <p className="binge-scribe-intro-lead">
                            No review yet for this scene. Pick how you
                            want to write it.
                        </p>
                        <div className="binge-scribe-intro-tone">
                            <label
                                htmlFor="scribe-intro-tone"
                                className="binge-scribe-intro-tone-label"
                            >
                                Voice
                            </label>
                            <select
                                id="scribe-intro-tone"
                                className="binge-scribe-tone"
                                value={tone}
                                onChange={(e) =>
                                    setTone(e.target.value as VoiceMode)
                                }
                                title="Voice tone for the LLM interview (ignored for manual writing)"
                            >
                                {VOICE_MODES.map((v) => (
                                    <option key={v} value={v}>
                                        {VOICE_LABELS[v]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="binge-scribe-intro-actions">
                            <button
                                type="button"
                                className="binge-scribe-save"
                                onClick={startManual}
                            >
                                Write manually
                            </button>
                            <button
                                type="button"
                                className="binge-scribe-save is-primary"
                                onClick={startLLMInterview}
                                disabled={busy}
                            >
                                Start LLM interview
                            </button>
                        </div>
                        <p className="binge-scribe-intro-note">
                            LLM mode runs an interview via the Stash
                            Scribe plugin → Ollama. If Ollama is
                            offline, use Write manually — same save
                            target, just no LLM assist.
                        </p>
                    </div>
                )}

                {phase === "interview" && loaded && (
                    <>
                        <div
                            className="binge-scribe-transcript"
                            ref={transcriptRef}
                        >
                            {messages
                                .filter((m) => m.role !== "system")
                                .map((m, i) => (
                                    <div
                                        key={i}
                                        className={
                                            "binge-scribe-msg is-" + m.role
                                        }
                                    >
                                        {m.content}
                                    </div>
                                ))}
                            {busy && busyMsg && (
                                <div className="binge-scribe-msg is-status">
                                    {busyMsg}
                                </div>
                            )}
                        </div>
                        <div className="binge-scribe-input-row">
                            <textarea
                                className="binge-scribe-input"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="Type your answer…"
                                rows={3}
                                disabled={busy}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        (e.metaKey || e.ctrlKey)
                                    ) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                            />
                            <div className="binge-scribe-input-actions">
                                <button
                                    type="button"
                                    className="binge-scribe-send"
                                    onClick={sendMessage}
                                    disabled={busy || !userInput.trim()}
                                >
                                    Send
                                </button>
                                <button
                                    type="button"
                                    className="binge-scribe-generate"
                                    onClick={generate}
                                    disabled={!canGenerate}
                                    title={
                                        canGenerate
                                            ? "Generate the review based on the conversation so far"
                                            : "Answer at least one question first"
                                    }
                                >
                                    Generate
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {phase === "result" && loaded && (
                    <>
                        <textarea
                            className="binge-scribe-review-text"
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="Review text"
                            rows={12}
                        />
                        {loaded.subject.criteria.length > 0 && (
                            <div className="binge-scribe-scores">
                                <div className="binge-scribe-scores-heading">
                                    Scores (Advanced Rating)
                                </div>
                                {loaded.subject.criteria.map((c) => (
                                    <ScoreRow
                                        key={c.id}
                                        criterion={c}
                                        value={scores[c.id] ?? null}
                                        onChange={(v) =>
                                            setScores((prev) => {
                                                const next = { ...prev };
                                                if (v == null)
                                                    delete next[c.id];
                                                else next[c.id] = v;
                                                return next;
                                            })
                                        }
                                    />
                                ))}
                            </div>
                        )}
                        <div className="binge-scribe-result-actions">
                            {!editMode && (
                                <button
                                    type="button"
                                    className="binge-scribe-back"
                                    onClick={backToInterview}
                                    disabled={busy}
                                >
                                    Back to interview
                                </button>
                            )}
                            <span style={{ flex: 1 }} />
                            {busyMsg && (
                                <span className="binge-scribe-status-inline">
                                    {busyMsg}
                                </span>
                            )}
                            <button
                                type="button"
                                className="binge-scribe-save"
                                onClick={() => save(false)}
                                disabled={busy || !reviewText.trim()}
                            >
                                Save review only
                            </button>
                            <button
                                type="button"
                                className="binge-scribe-save is-primary"
                                onClick={() => save(true)}
                                disabled={busy || !reviewText.trim()}
                            >
                                Save review + scores
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

// Surface a clearer hint for the most common failure mode (Ollama
// not running). Everything else falls through unchanged. Used in
// the error banner above the modal phases.
function friendlyError(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e);
    if (
        /connection refused|ECONNREFUSED|connect.*refused|failed to (?:fetch|connect)|connection error/i.test(
            msg
        )
    ) {
        return (
            "Couldn't reach Ollama. Start it on the host machine to generate new reviews — " +
            "existing reviews can still be edited and saved without it."
        );
    }
    return msg;
}

function ScoreRow({
    criterion,
    value,
    onChange,
}: {
    criterion: Criterion;
    value: number | null;
    onChange: (v: number | null) => void;
}) {
    return (
        <div className="binge-scribe-score-row">
            <div className="binge-scribe-score-name" title={criterion.description}>
                {criterion.name}
            </div>
            <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={value ?? 0}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="binge-scribe-score-range"
            />
            <div className="binge-scribe-score-value">
                {value == null ? "—" : value}
            </div>
            <button
                type="button"
                className="binge-scribe-score-clear"
                onClick={() => onChange(null)}
                aria-label="Clear this score"
                title="Don't write this score"
            >
                ×
            </button>
        </div>
    );
}
