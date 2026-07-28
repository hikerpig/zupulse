import { createHarmonyAnalysisInput, type HarmonyAnalysisInput } from "@zupulse/web-core";
import { PdfOmrError } from "./errors";
import { normalizeRational, safeLcm, type ExactRational } from "./rational";
import type { OmrScoreDraft } from "./schemas";
import { validateDraft } from "./validate-draft";

const alphaTabWholeNoteTicks = 3_840;
const maxWholeNoteTicks = 1_000_000;

export function projectDraftHarmony(draft: OmrScoreDraft): HarmonyAnalysisInput {
  const validation = validateDraft(draft);
  if (validation.readiness.harmony === "blocked") {
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "Draft is not Harmony-ready", {
      context: { reason: "harmony-readiness-blocked" },
    });
  }

  try {
    const wholeNoteTicks = collectWholeNoteTicks(draft);
    const referenceMeasures = draft.parts[0]?.staves[0]?.measures;
    if (referenceMeasures === undefined) throw new Error("missing-reference-measures");
    return createHarmonyAnalysisInput({
      ticksPerQuarter: wholeNoteTicks / 4,
      measures: referenceMeasures.map((measure) => {
        if (measure.duration === undefined || measure.timeSignature === undefined) {
          throw new Error("missing-measure-facts");
        }
        return {
          index: measure.index,
          durationTicks: toTicks(measure.duration, wholeNoteTicks),
          timeSignature: measure.timeSignature,
          ...(measure.keySignature === undefined ? {} : { key: `fifths:${measure.keySignature.fifths}` }),
        };
      }),
      tracks: draft.parts.map((part) => ({
        id: part.id,
        name: part.name,
        isPercussion: part.staves.some((staff) =>
          staff.measures.some((measure) => measure.clef?.sign === "percussion"),
        ),
        staves: part.staves.map((staff) => ({
          index: staff.index,
          notes: staff.measures.flatMap((measure) =>
            measure.voices.flatMap((voice) =>
              voice.events.flatMap((event) => {
                if (event.type === "rest") return [];
                const soundingMidi =
                  event.soundingMidi ??
                  (event.writtenPitch === undefined
                    ? undefined
                    : writtenMidi(event.writtenPitch.step, event.writtenPitch.alter, event.writtenPitch.octave));
                if (soundingMidi === undefined) throw new Error("missing-pitch");
                return [
                  {
                    id: event.id,
                    moment: {
                      measureIndex: measure.index,
                      offsetTicks: toTicks(event.onset, wholeNoteTicks),
                    },
                    durationTicks: toTicks(event.duration, wholeNoteTicks),
                    soundingPitchClass: ((soundingMidi % 12) + 12) % 12,
                    soundingMidi,
                    ...(event.writtenPitch === undefined
                      ? {}
                      : {
                          spelling: {
                            step: event.writtenPitch.step,
                            alter: event.writtenPitch.alter,
                          },
                        }),
                    voice: voice.index,
                    ...(event.tie === undefined ? {} : { tie: event.tie }),
                  },
                ];
              }),
            ),
          ),
        })),
      })),
    });
  } catch (error) {
    if (error instanceof PdfOmrError && error.code === "PROJECTION_OR_EXPORT_FAILED") throw error;
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "Draft cannot be projected to exact Harmony ticks", {
      context: { reason: "unsafe-tick-projection" },
      cause: error,
    });
  }
}

function collectWholeNoteTicks(draft: OmrScoreDraft): number {
  let wholeNoteTicks = alphaTabWholeNoteTicks;
  for (const part of draft.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        if (measure.duration !== undefined) wholeNoteTicks = includeDenominator(wholeNoteTicks, measure.duration);
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            wholeNoteTicks = includeDenominator(wholeNoteTicks, event.onset);
            wholeNoteTicks = includeDenominator(wholeNoteTicks, event.duration);
          }
        }
      }
    }
  }
  if (wholeNoteTicks > maxWholeNoteTicks || wholeNoteTicks % 4 !== 0) throw new Error("tick-limit");
  return wholeNoteTicks;
}

function includeDenominator(current: number, value: ExactRational): number {
  return safeLcm(current, normalizeRational(value).denominator);
}

function toTicks(value: ExactRational, wholeNoteTicks: number): number {
  const normalized = normalizeRational(value);
  if (wholeNoteTicks % normalized.denominator !== 0) throw new Error("inexact-ticks");
  const ticks = normalized.numerator * (wholeNoteTicks / normalized.denominator);
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("unsafe-ticks");
  return ticks;
}

function writtenMidi(step: "A" | "B" | "C" | "D" | "E" | "F" | "G", alter: number, octave: number): number {
  return (octave + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step] + alter;
}
