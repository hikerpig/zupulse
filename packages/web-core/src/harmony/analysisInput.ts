import { z } from "zod";
import { spelledPitchSchema, scoreWrittenMomentSchema } from "./schemas";

const harmonyNoteSchema = z
  .object({
    id: z.string().min(1),
    moment: scoreWrittenMomentSchema,
    durationTicks: z.number().int().positive(),
    soundingPitchClass: z.number().int().min(0).max(11).optional(),
    spelling: spelledPitchSchema.optional(),
    velocity: z.number().min(0).max(1).optional(),
    voice: z.number().int().positive(),
    tie: z.enum(["start", "continue", "end"]).optional(),
    grace: z.boolean().optional(),
  })
  .strict();
const harmonyStaffSchema = z
  .object({ index: z.number().int().nonnegative(), notes: z.array(harmonyNoteSchema) })
  .strict();
const harmonyTrackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    isPercussion: z.boolean(),
    hasPitches: z.boolean().optional(),
    staves: z.array(harmonyStaffSchema).min(1),
  })
  .strict();
const harmonyMeasureSchema = z
  .object({
    index: z.number().int().nonnegative(),
    durationTicks: z.number().int().positive(),
    timeSignature: z
      .object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() })
      .strict(),
    key: z.string().optional(),
  })
  .strict();
export const harmonyAnalysisInputSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    ticksPerQuarter: z.number().int().positive(),
    measures: z.array(harmonyMeasureSchema),
    tracks: z.array(harmonyTrackSchema),
    sourceHarmony: z.array(z.unknown()),
  })
  .strict();
export type HarmonyAnalysisInput = z.infer<typeof harmonyAnalysisInputSchema>;
export type HarmonyInputTrack = z.input<typeof harmonyTrackSchema>;

export function createHarmonyAnalysisInput(input: {
  ticksPerQuarter: number;
  measures: z.input<typeof harmonyMeasureSchema>[];
  tracks: HarmonyInputTrack[];
  sourceHarmony?: readonly unknown[];
}): HarmonyAnalysisInput {
  return harmonyAnalysisInputSchema.parse({
    schemaVersion: "1.0.0",
    ticksPerQuarter: input.ticksPerQuarter,
    measures: input.measures,
    tracks: input.tracks,
    sourceHarmony: input.sourceHarmony ?? [],
  });
}

export function createDefaultHarmonyScope(input: HarmonyAnalysisInput): { includedTrackIds: string[] } {
  return {
    includedTrackIds: input.tracks
      .filter(
        (track) =>
          !track.isPercussion &&
          (track.hasPitches ??
            track.staves.some((staff) => staff.notes.some((note) => note.soundingPitchClass !== undefined))),
      )
      .map((track) => track.id),
  };
}
