import type { HarmonyAnalysisInput } from "./analysisInput";
import { buildLegalBoundaryLattice, type HarmonyBoundaryPolicy } from "./boundaries";
import { buildHarmonyFeatureCache } from "./features";
import { generateHarmonyCandidates } from "./candidates";
import type { HarmonyCandidate } from "./candidates";
import type { HarmonyFeatureVector } from "./features";
import { applyHarmonyConfidence, mergeHarmonySegments, suppressShortNonChordSegments } from "./postprocess";
import type { HarmonySegment, ScoreWrittenRange } from "./schemas";
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
    sequenceSearchMode?: "beam" | "exact";
    maxSegmentQuarterNotes?: number;
    diagnostics?: {
      onRangeBuilt?: (range: ScoreWrittenRange) => void;
    };
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
  const rangeCache = new Map<
    string,
    {
      features: ReturnType<typeof cache.forRange>;
      candidates: ReturnType<typeof generateHarmonyCandidates>;
    }
  >();
  const featuresByCandidate = new WeakMap<HarmonyCandidate, HarmonyFeatureVector>();
  const forRange = (range: ScoreWrittenRange) => {
    const key = `${range.start.measureIndex}:${range.start.offsetTicks}-${range.end.measureIndex}:${range.end.offsetTicks}`;
    const cached = rangeCache.get(key);
    if (cached) return cached;
    const features = cache.forRange(range);
    const built = {
      features,
      candidates: generateHarmonyCandidates(range, features, {
        ...(options.topK === undefined ? {} : { topK: options.topK }),
      }),
    };
    for (const candidate of built.candidates) featuresByCandidate.set(candidate, features);
    rangeCache.set(key, built);
    options.diagnostics?.onRangeBuilt?.(range);
    return built;
  };
  const exactSearch = options.sequenceSearchMode === "exact";
  const durationSearch = exactSearch || options.maxSegmentQuarterNotes !== undefined;
  const absoluteTick = durationSearch ? createAbsoluteTick(input) : undefined;
  const maxSegmentTicks = (options.maxSegmentQuarterNotes ?? 8) * input.ticksPerQuarter;
  const minimumStartIndices =
    absoluteTick === undefined
      ? undefined
      : boundaries.map((end, endIndex) => {
          let startIndex = 0;
          while (startIndex < endIndex && absoluteTick(end) - absoluteTick(boundaries[startIndex]!) > maxSegmentTicks)
            startIndex += 1;
          return startIndex;
        });
  const decoded = decodeHarmonySequence({
    boundaries,
    candidates: (range) => forRange(range).candidates,
    transition: (from, to) => scoreHarmonyTransition(from, to) * input.ticksPerQuarter * 0.1,
    ...(exactSearch ? { searchMode: "exact" as const } : {}),
    ...(minimumStartIndices === undefined
      ? {}
      : { minimumStartIndex: (endIndex: number) => minimumStartIndices[endIndex] ?? endIndex }),
    ...(absoluteTick === undefined
      ? {}
      : {
          rangeAllowed: (range: ScoreWrittenRange) =>
            absoluteTick(range.end) - absoluteTick(range.start) <= maxSegmentTicks,
        }),
    beamWidth: 16,
    maxSegments: Math.max(64, input.measures.length),
    ...(durationSearch ? {} : { maxSpan: 16 }),
    onEndIndexComplete: () => rangeCache.clear(),
  });
  const segments: HarmonySegment[] = decoded.map((selected) => {
    const rangeFeatures = featuresByCandidate.get(selected.candidate) ?? cache.forRange(selected.range);
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

function createAbsoluteTick(input: Pick<HarmonyAnalysisInput, "measures">) {
  const starts = new Map<number, number>();
  let end = 0;
  for (const measure of input.measures) {
    starts.set(measure.index, end);
    end += measure.durationTicks;
  }
  return (moment: { measureIndex: number; offsetTicks: number }): number =>
    (starts.get(moment.measureIndex) ?? end) + moment.offsetTicks;
}
