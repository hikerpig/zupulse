import { analyzeHarmony, BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION, createDefaultHarmonyScope } from "@zupulse/web-core";
import { projectDraftHarmony } from "../project-harmony";
import type { OmrScoreDraft } from "../schemas";
import { validateDraft } from "../validate-draft";
import { calculateHarmonyImpactMetrics, type HarmonyImpactMetrics } from "./harmony-impact-metrics";

export function analyzeHarmonyImpactDrafts(
  expected: OmrScoreDraft,
  predicted: OmrScoreDraft,
  options: { decisionThreshold: number; confidenceThreshold: number },
): { algorithmVersion: string; metrics: HarmonyImpactMetrics } {
  const expectedInput = projectDraftHarmony(expected);
  const expectedScope = createDefaultHarmonyScope(expectedInput).includedTrackIds;
  const goldSegments = analyzeHarmony(expectedInput, {
    includedTrackIds: expectedScope,
    decisionThreshold: options.decisionThreshold,
    topK: 3,
  });
  const predictedValidation = validateDraft(predicted);
  if (predictedValidation.readiness.harmony === "blocked") {
    return {
      algorithmVersion: BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
      metrics: calculateHarmonyImpactMetrics({
        input: expectedInput,
        goldSegments,
        omr: { status: "blocked" },
        confidenceThreshold: options.confidenceThreshold,
      }),
    };
  }
  const predictedInput = projectDraftHarmony(predicted);
  const predictedScope = createDefaultHarmonyScope(predictedInput).includedTrackIds;
  const predictedSegments = analyzeHarmony(predictedInput, {
    includedTrackIds: predictedScope,
    decisionThreshold: options.decisionThreshold,
    topK: 3,
  });
  return {
    algorithmVersion: BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
    metrics: calculateHarmonyImpactMetrics({
      input: expectedInput,
      goldSegments,
      omr: { status: "analyzed", segments: predictedSegments },
      confidenceThreshold: options.confidenceThreshold,
    }),
  };
}
