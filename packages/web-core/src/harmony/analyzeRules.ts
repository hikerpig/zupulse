import type { HarmonyAnalysisInput } from "./analysisInput";
import { buildHarmonyFeatureCache } from "./features";
import { generateHarmonyCandidates } from "./candidates";
import { applyHarmonyConfidence, mergeHarmonySegments } from "./postprocess";
import type { HarmonySegment } from "./schemas";
import { decodeHarmonySequence } from "./decode";

export function analyzeHarmonyRules(
  input: HarmonyAnalysisInput,
  options: { includedTrackIds: readonly string[]; topK?: number; decisionThreshold?: number },
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
        })),
      ),
    );
  const cache = buildHarmonyFeatureCache({ ticksPerQuarter: input.ticksPerQuarter, notes });
  const boundaries = input.measures.flatMap((measure) => [
    { measureIndex: measure.index, offsetTicks: 0 },
    { measureIndex: measure.index, offsetTicks: measure.durationTicks },
  ]);
  const decoded = decodeHarmonySequence({
    boundaries,
    candidates: (range) =>
      generateHarmonyCandidates(range, cache.forRange(range), {
        ...(options.topK === undefined ? {} : { topK: options.topK }),
      }),
    beamWidth: 16,
    maxSegments: Math.max(64, input.measures.length),
    maxSpan: 16,
  });
  const segments: HarmonySegment[] = decoded.map((selected) => ({
    status: "resolved",
    range: selected.range,
    chord: selected.chord,
    confidence: selected.candidate.confidence,
    alternatives: generateHarmonyCandidates(selected.range, cache.forRange(selected.range), {
      ...(options.topK === undefined ? {} : { topK: options.topK }),
    }),
  }));
  return mergeHarmonySegments(applyHarmonyConfidence(segments, options.decisionThreshold ?? 0.6));
}
