import type { HarmonyAnalysisInput } from "./analysisInput";
import { bundledHarmonyRankerModel } from "./bundledHarmonyRanker";
import { generateHarmonyCandidates } from "./candidates";
import { decodePaperSemiCrfFactorized } from "./paper-semi-crf-decode";
import { buildPaperSemiCrfEvents } from "./paper-semi-crf-events";
import { createPaperSemiCrfFactorizedLinearScorers } from "./paper-semi-crf-features";
import { createPaperSemiCrfLabelInventory } from "./paper-semi-crf-labels";
import {
  PAPER_SEMI_CRF_FEATURE_VERSION,
  parsePaperSemiCrfLinearModel,
  type PaperSemiCrfLinearModel,
} from "./paper-semi-crf-model";
import { applyHarmonyConfidence } from "./postprocess";
import { buildHarmonyFeatureCache } from "./features";
import type { HarmonySegment } from "./schemas";

export function analyzeHarmonyPaperSemiCrf(
  input: HarmonyAnalysisInput,
  options: {
    includedTrackIds: readonly string[];
    model: PaperSemiCrfLinearModel;
    topK?: number;
    decisionThreshold?: number;
  },
): HarmonySegment[] {
  const model = parsePaperSemiCrfLinearModel(options.model);
  const events = buildPaperSemiCrfEvents(input, { includedTrackIds: options.includedTrackIds });
  if (events.length === 0) return [];
  const inventory = createPaperSemiCrfLabelInventory(model.labels);
  const labels = inventory.labels.map((label) => {
    if (label.status !== "supported")
      throw new Error(`unsupported bundled paper Semi-CRF label: ${label.referenceLabel}`);
    return label;
  });
  const scorers = createPaperSemiCrfFactorizedLinearScorers({
    events,
    labels,
    dictionary: { featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION, featureNames: model.featureNames },
    weights: model.weights,
  });
  const path = decodePaperSemiCrfFactorized({
    eventCount: events.length,
    labelCount: labels.length,
    maxSegmentLength: model.maxSegmentLength,
    ...scorers,
  });
  const featureCache = buildHarmonyFeatureCache({
    ticksPerQuarter: input.ticksPerQuarter,
    notes: scopedNotes(input, options.includedTrackIds),
  });
  const segments: HarmonySegment[] = path.segments.map((segment) => {
    const range = {
      start: events[segment.startEvent]!.range.start,
      end: events[segment.endEvent - 1]!.range.end,
    };
    const alternatives = generateHarmonyCandidates(range, featureCache.forRange(range), {
      rankerModel: bundledHarmonyRankerModel,
      ...(options.topK === undefined ? {} : { topK: options.topK }),
    });
    const chord = labels[segment.labelId]!.chord;
    const matching = alternatives.find((candidate) => sameChord(candidate.chord, chord));
    return {
      status: "resolved",
      range,
      chord,
      confidence: matching?.confidence ?? 0,
      alternatives,
    };
  });
  return applyHarmonyConfidence(segments, options.decisionThreshold ?? 0.6);
}

function scopedNotes(input: HarmonyAnalysisInput, includedTrackIds: readonly string[]) {
  const included = new Set(includedTrackIds);
  return input.tracks
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
}

function sameChord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
