import type { HarmonyAnalysisInput } from "./analysisInput";
import { buildLegalBoundaryLattice } from "./boundaries";
import { buildHarmonyFeatureCache } from "./features";
import { generateHarmonyCandidates } from "./candidates";
import { applyHarmonyConfidence, mergeHarmonySegments, suppressShortNonChordSegments } from "./postprocess";
import type { HarmonySegment } from "./schemas";
import { decodeHarmonySequence } from "./decode";
import { scoreHarmonyTransition } from "./transitions";
import { bundledHarmonyRankerModel } from "./bundledHarmonyRanker";
import type { HarmonyRankerModel } from "./learnedRanker";

export function analyzeHarmonyRules(
  input: HarmonyAnalysisInput,
  options: {
    includedTrackIds: readonly string[];
    topK?: number;
    decisionThreshold?: number;
    maxOptionalBoundariesPerMeasure?: number;
    rankerModel?: HarmonyRankerModel;
    rankerWeight?: number;
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
  const boundaries = buildLegalBoundaryLattice({
    ticksPerQuarter: input.ticksPerQuarter,
    measures: input.measures,
    tracks: input.tracks.filter((track) => included.has(track.id) && !track.isPercussion),
    ...(options.maxOptionalBoundariesPerMeasure === undefined
      ? {}
      : { maxOptionalPerMeasure: options.maxOptionalBoundariesPerMeasure }),
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
    const alternatives = generateHarmonyCandidates(selected.range, cache.forRange(selected.range), {
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
  return mergeHarmonySegments(applyHarmonyConfidence(corrected, options.decisionThreshold ?? 0.6));
}
