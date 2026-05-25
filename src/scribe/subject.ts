// Normalised "subject" the ScribeModal renders against. Lets the
// modal stay subject-agnostic — same UI for scenes + performers,
// only the data sources, prompts, and save fn differ.

import type { Criterion } from "../rating/types";
import {
    buildPerformerContextStrip,
    buildSceneContextStrip,
    describePerformerForLLM,
    describeSceneForLLM,
    extractScoresFromTagsGeneric,
    fetchPerformerForScribe,
    fetchSceneForScribe,
    loadPerformerCriteria,
    loadSceneCriteria,
    readExistingReviewGeneric,
    savePerformerReview,
    saveSceneReview,
} from "./api";
import {
    INTERVIEW_CONTRACT_PERFORMER,
    INTERVIEW_CONTRACT_SCENE,
    REVIEW_CONTRACT_PERFORMER,
    REVIEW_CONTRACT_SCENE,
} from "./prompts";
import {
    sessionKeyForPerformer,
    sessionKeyForScene,
} from "./session";

export type SubjectRef =
    | { kind: "scene"; id: string }
    | { kind: "performer"; id: string };

// What the modal needs from a loaded subject — every field is
// already normalised so the modal doesn't branch on kind once it
// has one of these.
export interface LoadedSubject {
    kind: "scene" | "performer";
    title: string;
    contextStrip: string;
    contextForLLM: string;
    existingReview: string | null;
    initialScores: Record<string, number>;
    criteria: Criterion[];
    interviewContract: string;
    reviewContract: string;
    sessionKey: string;
    save: (args: {
        reviewText: string;
        scoresByCriterion: Record<string, number>;
        autoCreate: boolean;
    }) => Promise<void>;
}

export async function loadSubject(
    ref: SubjectRef
): Promise<LoadedSubject | null> {
    if (ref.kind === "scene") {
        const [scene, criteria] = await Promise.all([
            fetchSceneForScribe(ref.id),
            loadSceneCriteria(),
        ]);
        if (!scene) return null;
        return {
            kind: "scene",
            title: scene.title ? `Stash Scribe — ${scene.title}` : "Stash Scribe",
            contextStrip: buildSceneContextStrip(scene),
            contextForLLM: describeSceneForLLM(scene),
            existingReview: readExistingReviewGeneric(scene),
            initialScores: extractScoresFromTagsGeneric(scene, criteria),
            criteria,
            interviewContract: INTERVIEW_CONTRACT_SCENE,
            reviewContract: REVIEW_CONTRACT_SCENE,
            sessionKey: sessionKeyForScene(ref.id),
            save: ({ reviewText, scoresByCriterion, autoCreate }) =>
                saveSceneReview({
                    scene,
                    reviewText,
                    criteria,
                    scoresByCriterion,
                    autoCreate,
                }),
        };
    }
    const [ctx, criteria] = await Promise.all([
        fetchPerformerForScribe(ref.id),
        loadPerformerCriteria(),
    ]);
    if (!ctx) return null;
    const { performer, aggregates } = ctx;
    return {
        kind: "performer",
        title: performer.name ? `Stash Scribe — ${performer.name}` : "Stash Scribe",
        contextStrip: buildPerformerContextStrip(performer, aggregates),
        contextForLLM: describePerformerForLLM(performer, aggregates),
        existingReview: readExistingReviewGeneric(performer),
        initialScores: extractScoresFromTagsGeneric(performer, criteria),
        criteria,
        interviewContract: INTERVIEW_CONTRACT_PERFORMER,
        reviewContract: REVIEW_CONTRACT_PERFORMER,
        sessionKey: sessionKeyForPerformer(ref.id),
        save: ({ reviewText, scoresByCriterion, autoCreate }) =>
            savePerformerReview({
                performer,
                reviewText,
                criteria,
                scoresByCriterion,
                autoCreate,
            }),
    };
}
