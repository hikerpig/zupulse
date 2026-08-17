import {
  analyzeHarmony,
  BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
  createDefaultHarmonyScope,
  PaperSemiCrfEventProjectionError,
} from "@zupulse/web-core";
import { PdfOmrError } from "../errors";
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
  let predictedSegments;
  try {
    const predictedInput = projectDraftHarmony(predicted);
    const predictedScope = createDefaultHarmonyScope(predictedInput).includedTrackIds;
    predictedSegments = analyzeHarmony(predictedInput, {
      includedTrackIds: predictedScope,
      decisionThreshold: options.decisionThreshold,
      topK: 3,
    });
  } catch (error) {
    if (!isPredictedHarmonyBlocked(error)) throw error;
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

function isPredictedHarmonyBlocked(error: unknown): boolean {
  return (
    error instanceof PaperSemiCrfEventProjectionError ||
    (error instanceof PdfOmrError && error.code === "PROJECTION_OR_EXPORT_FAILED")
  );
}
