import { z } from "zod";
import type { ScoreWrittenMoment } from "./writtenTime";

const uuidSchema = z.string().uuid();
const timestampSchema = z.iso.datetime();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const roundScore = (value: number): number => Number(value.toFixed(2));

export const spelledPitchSchema = z
  .object({
    step: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
    alter: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict();

export const chordKindSchema = z.enum([
  "major",
  "minor",
  "dominant",
  "diminished",
  "half-diminished",
  "augmented",
  "suspended-second",
  "suspended-fourth",
  "power",
]);
export const chordExtensionSchema = z.union([z.literal(6), z.literal(7), z.literal(9), z.literal(11), z.literal(13)]);
export const chordDegreeSchema = z
  .object({
    operation: z.enum(["add", "alter", "subtract"]),
    value: z.union([
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(9),
      z.literal(11),
      z.literal(13),
    ]),
    alter: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict();

export const chordSymbolSchema = z
  .object({
    root: spelledPitchSchema,
    kind: chordKindSchema,
    extension: chordExtensionSchema.optional(),
    degrees: z.array(chordDegreeSchema),
    bass: spelledPitchSchema.optional(),
  })
  .strict()
  .superRefine((chord, ctx) => {
    if (
      chord.kind === "dominant" &&
      chord.extension !== 7 &&
      chord.extension !== 9 &&
      chord.extension !== 11 &&
      chord.extension !== 13
    ) {
      ctx.addIssue({ code: "custom", path: ["extension"], message: "Dominant chords require a 7/9/11/13 extension" });
    }
    if (chord.kind === "half-diminished" && chord.extension !== 7) {
      ctx.addIssue({ code: "custom", path: ["extension"], message: "Half-diminished chords require extension 7" });
    }
    if (chord.kind === "power" && chord.extension !== undefined) {
      ctx.addIssue({ code: "custom", path: ["extension"], message: "Power chords cannot have an extension" });
    }
    const seen = new Set<number>();
    for (const [index, degree] of chord.degrees.entries()) {
      if (seen.has(degree.value))
        ctx.addIssue({ code: "custom", path: ["degrees", index], message: "Degree values must be unique" });
      seen.add(degree.value);
      if (degree.operation !== "add" && degree.value < 3) {
        ctx.addIssue({ code: "custom", path: ["degrees", index], message: "Only add may introduce a 2 degree" });
      }
    }
  })
  .transform((chord) => ({
    ...chord,
    degrees: [...chord.degrees].sort(
      (a, b) => a.value - b.value || a.operation.localeCompare(b.operation) || a.alter - b.alter,
    ),
  }));

export const scoreWrittenMomentSchema = z
  .object({ measureIndex: z.number().int().nonnegative(), offsetTicks: z.number().int().nonnegative() })
  .strict();
export const scoreWrittenRangeSchema = z
  .object({ start: scoreWrittenMomentSchema, end: scoreWrittenMomentSchema })
  .strict()
  .refine(({ start, end }) => compareMoments(start, end) < 0, "Range must be non-empty");
export const harmonyCandidateSchema = z
  .object({
    chord: chordSymbolSchema,
    localScore: z.number(),
    sequenceScore: z.number(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
const harmonyReasonSchema = z.enum([
  "low-confidence",
  "source-conflict",
  "unsupported-source-harmony",
  "microtonal",
  "unsupported-time",
]);
export const harmonySegmentSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("resolved"),
      range: scoreWrittenRangeSchema,
      chord: chordSymbolSchema,
      confidence: z.number().min(0).max(1),
      alternatives: z.array(harmonyCandidateSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("unresolved"),
      range: scoreWrittenRangeSchema,
      reason: harmonyReasonSchema,
      alternatives: z.array(harmonyCandidateSchema),
    })
    .strict(),
]);
export const harmonyAnalysisRevisionSchema = z
  .object({
    id: uuidSchema,
    algorithmVersion: z.string().min(1),
    createdAt: timestampSchema,
    parameters: z
      .object({
        scope: z.object({ includedTrackIds: z.array(z.string().min(1)).min(1) }).strict(),
        topK: z.number().int().min(1).max(8),
        decisionThreshold: z.number().min(0).max(1),
      })
      .strict(),
    segments: z.array(harmonySegmentSchema),
  })
  .strict()
  .transform((revision) => ({
    ...revision,
    parameters: { ...revision.parameters, decisionThreshold: roundScore(revision.parameters.decisionThreshold) },
    segments: revision.segments.map((segment) => ({
      ...segment,
      ...(segment.status === "resolved" ? { confidence: roundScore(segment.confidence) } : {}),
      alternatives: segment.alternatives
        .filter((alternative) => alternative.confidence >= revision.parameters.decisionThreshold)
        .map((alternative) => ({
          ...alternative,
          localScore: roundScore(alternative.localScore),
          sequenceScore: roundScore(alternative.sequenceScore),
          confidence: roundScore(alternative.confidence),
        })),
    })),
  }));
export const harmonyCorrectionValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chord"), chord: chordSymbolSchema }).strict(),
  z.object({ type: z.literal("no-chord") }).strict(),
]);
export const harmonyCorrectionSchema = z
  .object({
    id: uuidSchema,
    range: scoreWrittenRangeSchema,
    value: harmonyCorrectionValueSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export const annotationTargetSchema = z
  .object({ trackId: z.string().min(1), staffIndex: z.number().int().nonnegative() })
  .strict();
export const harmonyAnalysisDocumentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    libraryScoreId: uuidSchema,
    sourceContentHash: hashSchema,
    documentVersion: z.number().int().nonnegative(),
    activeRevision: harmonyAnalysisRevisionSchema,
    corrections: z.array(harmonyCorrectionSchema),
    annotationTarget: annotationTargetSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type ChordSymbolInput = z.input<typeof chordSymbolSchema>;
export type HarmonyAnalysisDocument = z.output<typeof harmonyAnalysisDocumentSchema>;
export type ScoreWrittenRange = z.infer<typeof scoreWrittenRangeSchema>;
export type HarmonySegment = z.infer<typeof harmonySegmentSchema>;
export type HarmonyCorrection = z.infer<typeof harmonyCorrectionSchema>;
export type AnnotationTarget = z.infer<typeof annotationTargetSchema>;

export function compareMoments(a: ScoreWrittenMoment, b: ScoreWrittenMoment): number {
  return a.measureIndex - b.measureIndex || a.offsetTicks - b.offsetTicks;
}
