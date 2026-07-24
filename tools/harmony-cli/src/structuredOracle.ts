import {
  buildHarmonyFeatureCache,
  buildLegalBoundaryLattice,
  generateHarmonyCandidates,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { V3DatasetRole } from "./evaluationProtocol";
import { harmonyStructuredOracleResultSchema, type HarmonyStructuredOracleResult } from "./schemas";

type StructuredGold = {
  range: ScoreWrittenRange;
  chord?: ChordSymbolInput;
};

type StructuredOracleRequest = {
  corpus: string;
  groupId: string;
  role: V3DatasetRole;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly StructuredGold[];
  maxSpan?: number;
  maxQuarterNotes?: number;
  topK: number;
};

export function evaluateStructuredTrainingOracle(request: StructuredOracleRequest): HarmonyStructuredOracleResult {
  if (request.role !== "train")
    throw new Error(`structured oracle requires train role: ${request.groupId} is ${request.role}`);
  return evaluateOracle(request);
}

export function evaluateStructuredTuneOracle(request: StructuredOracleRequest): HarmonyStructuredOracleResult {
  if (request.role !== "tune")
    throw new Error(`structured tune oracle requires tune role: ${request.groupId} is ${request.role}`);
  return evaluateOracle(request);
}

function evaluateOracle(request: StructuredOracleRequest): HarmonyStructuredOracleResult {
  if (request.maxSpan !== undefined && request.maxQuarterNotes !== undefined)
    throw new Error("structured oracle accepts only one span limit");
  const maxSpan = request.maxSpan ?? (request.maxQuarterNotes === undefined ? 16 : undefined);
  const maxDurationTicks =
    request.maxQuarterNotes === undefined ? undefined : request.maxQuarterNotes * request.input.ticksPerQuarter;
  const included = new Set(request.includedTrackIds);
  const tracks = request.input.tracks.filter((track) => included.has(track.id) && !track.isPercussion);
  const analysisInput = { ...request.input, tracks };
  const boundaries = buildLegalBoundaryLattice(analysisInput).moments;
  const boundaryIndices = new Map(boundaries.map((moment, index) => [momentKey(moment), index]));
  const absoluteTick = createAbsoluteTick(request.input);
  const features = buildHarmonyFeatureCache({
    ticksPerQuarter: request.input.ticksPerQuarter,
    notes: tracks.flatMap((track) =>
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
    ),
  });
  const mapped = request.gold.filter(
    (item): item is StructuredGold & { chord: ChordSymbolInput } => item.chord !== undefined,
  );
  const goldRangeKeys = new Set(mapped.map((item) => rangeKey(item.range)));
  const candidateCache = new Map<string, ReturnType<typeof generateHarmonyCandidates>>();
  let rangeCount = 0;
  let candidateCount = 0;
  for (let endIndex = 1; endIndex < boundaries.length; endIndex += 1) {
    for (let startIndex = endIndex - 1; startIndex >= 0; startIndex -= 1) {
      const range = { start: boundaries[startIndex]!, end: boundaries[endIndex]! };
      const durationTicks = absoluteTick(range.end) - absoluteTick(range.start);
      if (maxDurationTicks !== undefined && durationTicks > maxDurationTicks) break;
      if (maxSpan !== undefined && endIndex - startIndex > maxSpan) break;
      const key = rangeKey(range);
      if (goldRangeKeys.has(key))
        candidateCache.set(key, generateHarmonyCandidates(range, features.forRange(range), { topK: request.topK }));
      rangeCount += 1;
      candidateCount += request.topK;
    }
  }

  let representableBoundaries = 0;
  let representableSpans = 0;
  let evaluableCandidates = 0;
  let oracleHits = 0;
  let representableSegments = 0;
  let missingBoundarySegments = 0;
  let excessiveSpanSegments = 0;
  let candidateMissSegments = 0;
  let maxObservedSpan = 0;
  let maxObservedQuarterNotes = 0;
  const durationCounts = new Map<number, number>();
  const samples: Array<{
    range: ScoreWrittenRange;
    reason: "missing-boundary" | "excessive-span" | "candidate-miss";
    span?: number;
    durationQuarterNotes: number;
    chord: ChordSymbolInput;
  }> = [];
  for (const gold of mapped) {
    const durationQuarterNotes =
      (absoluteTick(gold.range.end) - absoluteTick(gold.range.start)) / request.input.ticksPerQuarter;
    const roundedDuration = Number(durationQuarterNotes.toFixed(2));
    durationCounts.set(roundedDuration, (durationCounts.get(roundedDuration) ?? 0) + 1);
    maxObservedQuarterNotes = Math.max(maxObservedQuarterNotes, durationQuarterNotes);
    const startIndex = boundaryIndices.get(momentKey(gold.range.start));
    const endIndex = boundaryIndices.get(momentKey(gold.range.end));
    if (startIndex !== undefined) representableBoundaries += 1;
    if (endIndex !== undefined) representableBoundaries += 1;
    if (startIndex === undefined || endIndex === undefined || endIndex <= startIndex) {
      missingBoundarySegments += 1;
      addSample(samples, {
        range: gold.range,
        reason: "missing-boundary",
        durationQuarterNotes,
        chord: gold.chord,
      });
      continue;
    }
    const span = endIndex - startIndex;
    maxObservedSpan = Math.max(maxObservedSpan, span);
    const durationTicks = absoluteTick(gold.range.end) - absoluteTick(gold.range.start);
    const spanRepresentable =
      (maxSpan === undefined || span <= maxSpan) &&
      (maxDurationTicks === undefined || durationTicks <= maxDurationTicks);
    if (!spanRepresentable) {
      excessiveSpanSegments += 1;
      addSample(samples, {
        range: gold.range,
        reason: "excessive-span",
        span,
        durationQuarterNotes,
        chord: gold.chord,
      });
      continue;
    }
    representableSpans += 1;
    evaluableCandidates += 1;
    const hit = candidateCache.get(rangeKey(gold.range))?.some((candidate) => sameChord(candidate.chord, gold.chord));
    if (!hit) {
      candidateMissSegments += 1;
      addSample(samples, {
        range: gold.range,
        reason: "candidate-miss",
        span,
        durationQuarterNotes,
        chord: gold.chord,
      });
      continue;
    }
    oracleHits += 1;
    representableSegments += 1;
  }
  const mappedSegments = mapped.length;
  return harmonyStructuredOracleResultSchema.parse({
    corpus: request.corpus,
    groupId: request.groupId,
    mappedSegments,
    unsupportedSegments: request.gold.length - mappedSegments,
    boundaries: {
      required: mappedSegments * 2,
      representable: representableBoundaries,
      ratio: ratio(representableBoundaries, mappedSegments * 2),
    },
    spans: {
      required: mappedSegments,
      representable: representableSpans,
      ratio: ratio(representableSpans, mappedSegments),
    },
    candidates: {
      evaluable: evaluableCandidates,
      oracleHits,
      recall: ratio(oracleHits, evaluableCandidates),
    },
    path: {
      representableSegments,
      ratio: ratio(representableSegments, mappedSegments),
      complete: representableSegments === mappedSegments,
    },
    durationHistogram: [...durationCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([quarterNotes, count]) => ({ quarterNotes, count })),
    failures: {
      missingBoundarySegments,
      excessiveSpanSegments,
      candidateMissSegments,
      maxObservedSpan,
      maxObservedQuarterNotes,
      samples,
    },
    search: {
      legalBoundaries: boundaries.length,
      ranges: rangeCount,
      candidates: candidateCount,
      candidateCountMode: "top-k-upper-bound",
      estimatedBytes: boundaries.length * 16 + rangeCount * 32 + candidateCount * 256,
    },
  });
}

function createAbsoluteTick(input: Pick<HarmonyAnalysisInput, "measures">) {
  const starts = new Map<number, number>();
  let start = 0;
  for (const measure of input.measures) {
    starts.set(measure.index, start);
    start += measure.durationTicks;
  }
  return (moment: ScoreWrittenMoment): number => (starts.get(moment.measureIndex) ?? start) + moment.offsetTicks;
}

function addSample<T>(samples: T[], sample: T): void {
  if (samples.length < 20) samples.push(sample);
}

function momentKey(moment: ScoreWrittenMoment): string {
  return `${moment.measureIndex}:${moment.offsetTicks}`;
}

function rangeKey(range: ScoreWrittenRange): string {
  return `${momentKey(range.start)}-${momentKey(range.end)}`;
}

function sameChord(a: ChordSymbolInput, b: ChordSymbolInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
