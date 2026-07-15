import type { HarmonyAnalysisInput } from "./analysisInput";
import { buildHarmonyFeatureCache } from "./features";
import { generateHarmonyCandidates } from "./candidates";
import { applyHarmonyConfidence, mergeHarmonySegments } from "./postprocess";
import type { HarmonySegment } from "./schemas";

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
        })),
      ),
    );
  const cache = buildHarmonyFeatureCache({ ticksPerQuarter: input.ticksPerQuarter, notes });
  const segments = input.measures.map((measure) => {
    const range = {
      start: { measureIndex: measure.index, offsetTicks: 0 },
      end: { measureIndex: measure.index, offsetTicks: measure.durationTicks },
    };
    const alternatives = generateHarmonyCandidates(range, cache.forRange(range), {
      ...(options.topK === undefined ? {} : { topK: options.topK }),
    });
    const selected = alternatives[0]!;
    return {
      status: "resolved" as const,
      range,
      chord: selected.chord,
      confidence: selected.confidence,
      alternatives,
    };
  });
  return mergeHarmonySegments(applyHarmonyConfidence(segments, options.decisionThreshold ?? 0.6));
}
