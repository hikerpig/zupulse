import {
  buildHarmonyFeatureCache,
  buildLegalBoundaryLattice,
  createStructuredFeatureCache,
  flattenStructuredSegmentFeatures,
  generateHarmonyCandidates,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { V3DatasetRole } from "./evaluationProtocol";
import { harmonyStructuredRecordPieceSchema, type HarmonyStructuredRecordPiece } from "./schemas";

type StructuredGold = {
  range: ScoreWrittenRange;
  chord?: ChordSymbolInput;
};

export function createTrainingStructuredRecordPiece(request: {
  id: string;
  corpus: string;
  groupId: string;
  role: V3DatasetRole;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly StructuredGold[];
}): HarmonyStructuredRecordPiece {
  if (request.role !== "train")
    throw new Error(`structured training records require train role: ${request.groupId} is ${request.role}`);
  return createPiece(request);
}

export function createTuneStructuredRecordPiece(request: {
  id: string;
  corpus: string;
  groupId: string;
  role: V3DatasetRole;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly StructuredGold[];
}): HarmonyStructuredRecordPiece {
  if (request.role !== "tune")
    throw new Error(`structured tune records require tune role: ${request.groupId} is ${request.role}`);
  return createPiece(request);
}

function createPiece(request: {
  id: string;
  corpus: string;
  groupId: string;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly StructuredGold[];
}) {
  const included = new Set(request.includedTrackIds);
  const tracks = request.input.tracks.filter((track) => included.has(track.id) && !track.isPercussion);
  const boundaries = buildLegalBoundaryLattice({ ...request.input, tracks, policy: "dense-note-events" }).moments;
  const boundaryIndices = new Map(boundaries.map((moment, index) => [momentKey(moment), index]));
  const absoluteTick = createAbsoluteTick(request.input);
  const baseFeatures = buildHarmonyFeatureCache({
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
  const structuredFeatures = createStructuredFeatureCache({ ...request.input, tracks }, request.includedTrackIds);
  const rangeCache = new Map<string, ReturnType<typeof generateHarmonyCandidates>>();
  const candidatesForRange = (range: ScoreWrittenRange) => {
    const key = rangeKey(range);
    const cached = rangeCache.get(key);
    if (cached) return cached;
    const candidates = generateHarmonyCandidates(range, baseFeatures.forRange(range), { topK: 8 });
    rangeCache.set(key, candidates);
    return candidates;
  };
  const excluded = { unsupported: 0, missingBoundary: 0, excessiveDuration: 0, candidateMiss: 0 };
  const eligible: Array<{
    range: ScoreWrittenRange;
    chord: ChordSymbolInput;
    startBoundaryIndex: number;
    endBoundaryIndex: number;
  }> = [];
  for (const gold of request.gold) {
    if (!gold.chord) {
      excluded.unsupported += 1;
      continue;
    }
    const startBoundaryIndex = boundaryIndices.get(momentKey(gold.range.start));
    const endBoundaryIndex = boundaryIndices.get(momentKey(gold.range.end));
    if (startBoundaryIndex === undefined || endBoundaryIndex === undefined || endBoundaryIndex <= startBoundaryIndex) {
      excluded.missingBoundary += 1;
      continue;
    }
    if (durationQuarterNotes(gold.range) > 8) {
      excluded.excessiveDuration += 1;
      continue;
    }
    if (!candidatesForRange(gold.range).some((candidate) => sameChord(candidate.chord, gold.chord))) {
      excluded.candidateMiss += 1;
      continue;
    }
    eligible.push({ range: gold.range, chord: gold.chord, startBoundaryIndex, endBoundaryIndex });
  }
  const runs: (typeof eligible)[] = [];
  for (const segment of eligible.sort((a, b) => a.startBoundaryIndex - b.startBoundaryIndex)) {
    const current = runs.at(-1);
    if (current?.at(-1)?.endBoundaryIndex === segment.startBoundaryIndex) current.push(segment);
    else runs.push([segment]);
  }
  const chordIndices = new Map<string, number>();
  const chords: ChordSymbolInput[] = [];
  const chordIndex = (chord: ChordSymbolInput) => {
    const key = JSON.stringify(chord);
    const existing = chordIndices.get(key);
    if (existing !== undefined) return existing;
    const index = chords.length;
    chordIndices.set(key, index);
    chords.push(chord);
    return index;
  };
  const windows = runs.map((run) => {
    const startBoundaryIndex = run[0]!.startBoundaryIndex;
    const endBoundaryIndex = run.at(-1)!.endBoundaryIndex;
    const ranges = [];
    const rangeIndices = new Map<string, number>();
    for (let endIndex = startBoundaryIndex + 1; endIndex <= endBoundaryIndex; endIndex += 1) {
      for (let startIndex = endIndex - 1; startIndex >= startBoundaryIndex; startIndex -= 1) {
        const range = { start: boundaries[startIndex]!, end: boundaries[endIndex]! };
        const duration = durationQuarterNotes(range);
        if (duration > 8) break;
        const candidates = candidatesForRange(range);
        if (candidates.length === 0) continue;
        rangeIndices.set(rangeKey(range), ranges.length);
        ranges.push({
          startBoundaryIndex: startIndex,
          endBoundaryIndex: endIndex,
          durationQuarterNotes: q2(duration),
          candidates: candidates.map((candidate) => ({
            chordIndex: chordIndex(candidate.chord),
            ruleSequenceScore: q2(candidate.sequenceScore),
            segmentFeatures: flattenStructuredSegmentFeatures(structuredFeatures.forCandidate(range, candidate.chord)),
          })),
        });
      }
    }
    return {
      startBoundaryIndex,
      endBoundaryIndex,
      ranges,
      gold: run.map((segment) => {
        const rangeIndex = rangeIndices.get(rangeKey(segment.range));
        if (rangeIndex === undefined)
          throw new Error(`gold range missing from structured window: ${rangeKey(segment.range)}`);
        const candidateIndex = candidatesForRange(segment.range).findIndex((candidate) =>
          sameChord(candidate.chord, segment.chord),
        );
        return {
          startBoundaryIndex: segment.startBoundaryIndex,
          endBoundaryIndex: segment.endBoundaryIndex,
          rangeIndex,
          candidateIndex,
        };
      }),
    };
  });
  return harmonyStructuredRecordPieceSchema.parse({
    schemaVersion: "1.0.0",
    featureVersion: "semi-crf-linear-v1",
    id: request.id,
    corpus: request.corpus,
    groupId: request.groupId,
    boundaries,
    chords,
    windows,
    excluded,
  });

  function durationQuarterNotes(range: ScoreWrittenRange) {
    return (absoluteTick(range.end) - absoluteTick(range.start)) / request.input.ticksPerQuarter;
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

function momentKey(moment: { measureIndex: number; offsetTicks: number }): string {
  return `${moment.measureIndex}:${moment.offsetTicks}`;
}

function rangeKey(range: ScoreWrittenRange): string {
  return `${momentKey(range.start)}-${momentKey(range.end)}`;
}

function sameChord(a: ChordSymbolInput, b: ChordSymbolInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function q2(value: number): number {
  return Number(value.toFixed(2));
}
