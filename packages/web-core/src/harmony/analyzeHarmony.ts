import type { HarmonyAnalysisInput } from "./analysisInput";
import { analyzeHarmonyPaperSemiCrf } from "./analyzePaperSemiCrf";
import { BUNDLED_PAPER_SEMI_CRF_MODEL_SHA256, bundledPaperSemiCrfModel } from "./bundledPaperSemiCrf";
import type { HarmonySegment } from "./schemas";

export const BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION =
  `paper-semi-crf-mozart-v1-${BUNDLED_PAPER_SEMI_CRF_MODEL_SHA256}` as const;

export function analyzeHarmony(
  input: HarmonyAnalysisInput,
  options: {
    includedTrackIds: readonly string[];
    topK?: number;
    decisionThreshold?: number;
  },
): HarmonySegment[] {
  return analyzeHarmonyPaperSemiCrf(input, {
    ...options,
    model: bundledPaperSemiCrfModel,
  });
}
