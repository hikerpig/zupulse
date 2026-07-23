import type { HarmonyAnalysisInput } from "./analysisInput";
import { buildLegalBoundaryLattice, type HarmonyBoundaryPolicy } from "./boundaries";
import { buildHarmonyFeatureCache } from "./features";
import { generateHarmonyCandidates } from "./candidates";
import { applyHarmonyConfidence, mergeHarmonySegments, suppressShortNonChordSegments } from "./postprocess";
import type { HarmonySegment } from "./schemas";
import { decodeHarmonySequence } from "./decode";
import { scoreHarmonyTransition } from "./transitions";
import { bundledHarmonyRankerModel } from "./bundledHarmonyRanker";
import { createHarmonyRankerFeatures, type HarmonyRankerModel } from "./learnedRanker";
import { createMlpHarmonyPrimarySelector, type MlpHarmonyRerankerModel } from "./mlpReranker";
import { bundledHarmonyPrimaryMlp } from "./bundledHarmonyPrimaryMlp";
import { applyHarmonyCalibration, type MlpHarmonyCalibrationAsset } from "./confidenceCalibration";
import type { HarmonyBoundaryClassifierModel } from "./boundaryClassifier";

export function analyzeHarmonyRules(
  input: HarmonyAnalysisInput,
  options: {
    includedTrackIds: readonly string[];
    topK?: number;
    decisionThreshold?: number;
    maxOptionalBoundariesPerMeasure?: number;
    boundaryPolicy?: HarmonyBoundaryPolicy;
    boundaryClassifierModel?: HarmonyBoundaryClassifierModel;
    rankerModel?: HarmonyRankerModel;
    rankerWeight?: number;
    primaryRerankerModel?: MlpHarmonyRerankerModel | false;
    primaryConfidenceCalibration?: MlpHarmonyCalibrationAsset | false;
  },
): HarmonySegment[] {
  const included = new Set(options.includedTrackIds);
  const notes = input.tracks
    .filter((track) => included.has(track.id) && !track.isPercussion)
    .flatMap((track) =>
      track.staves.flatMap((staff) =>
        staff.notes.map((note) => ({
          moment: note.moment,
          durationTicks: note.durationTicks,
          voice: note.voice,
          ...(note.soundingPitchClass === undefined ? {} : { soundingPitchClass: note.soundingPitchClass }),
          ...(note.soundingMidi === undefined ? {} : { soundingMidi: note.soundingMidi }),
          ...(note.spelling === undefined ? {} : { spelling: note.spelling }),
        })),
      ),
    );
  const cache = buildHarmonyFeatureCache({ ticksPerQuarter: input.ticksPerQuarter, notes });
  const selectPrimary =
    options.primaryRerankerModel === false
      ? undefined
      : createMlpHarmonyPrimarySelector(options.primaryRerankerModel ?? bundledHarmonyPrimaryMlp);
  const primaryCalibration =
    options.primaryConfidenceCalibration === false ? undefined : options.primaryConfidenceCalibration;
  const boundaries = buildLegalBoundaryLattice({
    ticksPerQuarter: input.ticksPerQuarter,
    measures: input.measures,
    tracks: input.tracks.filter((track) => included.has(track.id) && !track.isPercussion),
    ...(options.maxOptionalBoundariesPerMeasure === undefined
      ? {}
      : { maxOptionalPerMeasure: options.maxOptionalBoundariesPerMeasure }),
    ...(options.boundaryPolicy === undefined ? {} : { policy: options.boundaryPolicy }),
    ...(options.boundaryClassifierModel === undefined
      ? {}
      : { boundaryClassifierModel: options.boundaryClassifierModel }),
  }).moments;
  const decoded = decodeHarmonySequence({
    boundaries,
    candidates: (range) =>
      generateHarmonyCandidates(range, cache.forRange(range), {
        ...(options.topK === undefined ? {} : { topK: options.topK }),
      }),
    transition: (from, to) => scoreHarmonyTransition(from, to) * input.ticksPerQuarter * 0.1,
    beamWidth: 16,
    maxSegments: Math.max(64, input.measures.length),
    maxSpan: 16,
  });
  const segments: HarmonySegment[] = decoded.map((selected) => {
    const rangeFeatures = cache.forRange(selected.range);
    const alternatives = generateHarmonyCandidates(selected.range, rangeFeatures, {
      ...(options.topK === undefined ? {} : { topK: options.topK }),
      rankerModel: options.rankerModel ?? bundledHarmonyRankerModel,
      ...(options.rankerWeight === undefined ? {} : { rankerWeight: options.rankerWeight }),
    });
    return {
      status: "resolved",
      range: selected.range,
      chord: selected.chord,
      confidence: selected.candidate.confidence,
      alternatives,
    };
  });
  const corrected = suppressShortNonChordSegments(segments, input.ticksPerQuarter / 4);
  if (selectPrimary === undefined)
    return mergeHarmonySegments(applyHarmonyConfidence(corrected, options.decisionThreshold ?? 0.6));
  const rerankPrimary = selectPrimary;
  if (primaryCalibration === undefined) {
    const finalized = mergeHarmonySegments(applyHarmonyConfidence(corrected, options.decisionThreshold ?? 0.6));
    return rerankSegments(finalized);
  }
  const finalized = mergeHarmonySegments(corrected);
  const reranked = rerankSegments(finalized);
  return applyHarmonyConfidence(reranked, options.decisionThreshold ?? 0.6);

  function rerankSegments(inputSegments: HarmonySegment[]): HarmonySegment[] {
    return inputSegments.map((segment) => {
      if (segment.status !== "resolved" || segment.alternatives.length === 0) return segment;
      const rangeFeatures = cache.forRange(segment.range);
      const rulePrimaryIndex = segment.alternatives.findIndex(
        (candidate) => JSON.stringify(candidate.chord) === JSON.stringify(segment.chord),
      );
      const selected = rerankPrimary(
        segment.alternatives.map((candidate) => ({
          ...candidate,
          features: createHarmonyRankerFeatures(rangeFeatures, candidate.chord),
          ruleLocalScore: candidate.localScore,
          ruleSequenceScore: candidate.sequenceScore,
        })),
        rulePrimaryIndex,
      );
      return selected === undefined
        ? segment
        : {
            ...segment,
            chord: segment.alternatives[selected.index]!.chord,
            confidence: primaryCalibration
              ? applyHarmonyCalibration(selected.rawConfidence, primaryCalibration)
              : segment.confidence,
          };
    });
  }
}
