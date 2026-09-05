import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { pdfOmrErrorCodes, type PdfOmrErrorCode } from "../errors";
import { omrScoreDraftSchema, sha256Schema, type OmrScoreDraft } from "../schemas";

const topologyClassificationSchema = z.enum([
  "empty-part",
  "header-only-extra-part",
  "duplicate-extra-part",
  "contentful-extra-part",
  "unresolved-role",
  "engine-failure",
  "other-failure",
]);

const partEvidenceSchema = z
  .object({
    partId: z.string().min(1),
    staffCount: z.number().int().nonnegative(),
    measureCountsByStaff: z.array(z.number().int().nonnegative()),
    voiceCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    pitchedEventCount: z.number().int().nonnegative(),
    restEventCount: z.number().int().nonnegative(),
    clefs: z.array(z.string()),
    minimumSoundingMidi: z.number().int().min(0).max(127).optional(),
    maximumSoundingMidi: z.number().int().min(0).max(127).optional(),
    musicalFactsSha256: sha256Schema,
  })
  .strict();

const topologyItemEvidenceSchema = z
  .object({
    itemId: z.string().min(1),
    error: z
      .object({
        code: z.enum(pdfOmrErrorCodes),
        reason: z.string().min(1).optional(),
      })
      .strict(),
    classification: topologyClassificationSchema,
    predicted: z
      .object({
        partCount: z.number().int().nonnegative(),
        staffCount: z.number().int().nonnegative(),
        parts: z.array(partEvidenceSchema),
      })
      .strict()
      .optional(),
    expectedTopology: z
      .object({
        partCount: z.number().int().nonnegative(),
        staffCount: z.number().int().nonnegative(),
        staffCountsByPart: z.array(z.number().int().nonnegative()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const topologyEvidenceReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sourceReportSha256: sha256Schema,
    items: z.array(topologyItemEvidenceSchema),
    summary: z
      .object({
        attempted: z.number().int().nonnegative(),
        classifications: z.record(z.string(), z.number().int().positive()),
      })
      .strict(),
  })
  .strict();

export type TopologyEvidenceReport = z.infer<typeof topologyEvidenceReportSchema>;

export type TopologyEvidenceInputItem = {
  itemId: string;
  error: {
    code: PdfOmrErrorCode;
    message: string;
    context?: Readonly<Record<string, unknown>>;
  };
  predicted?: OmrScoreDraft;
  expected?: OmrScoreDraft;
};

export function buildTopologyEvidenceReport(input: {
  sourceReportSha256: string;
  items: readonly TopologyEvidenceInputItem[];
}): TopologyEvidenceReport {
  const items = input.items
    .map(buildItemEvidence)
    .sort((left, right) => left.itemId.localeCompare(right.itemId, "en-US"));
  const classifications: Record<string, number> = {};
  for (const item of items) {
    classifications[item.classification] = (classifications[item.classification] ?? 0) + 1;
  }
  return topologyEvidenceReportSchema.parse({
    schemaVersion: "1.0.0",
    sourceReportSha256: sha256Schema.parse(input.sourceReportSha256),
    items,
    summary: { attempted: items.length, classifications },
  });
}

function buildItemEvidence(item: TopologyEvidenceInputItem): z.infer<typeof topologyItemEvidenceSchema> {
  const predictedDraft = item.predicted === undefined ? undefined : omrScoreDraftSchema.parse(item.predicted);
  const expectedDraft = item.expected === undefined ? undefined : omrScoreDraftSchema.parse(item.expected);
  const predicted = predictedDraft === undefined ? undefined : summarizePredicted(predictedDraft);
  const expectedTopology = expectedDraft === undefined ? undefined : summarizeExpectedTopology(expectedDraft);
  const reason = safeReason(item.error.context?.reason);
  return topologyItemEvidenceSchema.parse({
    itemId: item.itemId,
    error: { code: item.error.code, ...(reason === undefined ? {} : { reason }) },
    classification: classify(item.error.code, reason, predictedDraft, expectedDraft),
    ...(predicted === undefined ? {} : { predicted }),
    ...(expectedTopology === undefined ? {} : { expectedTopology }),
  });
}

function classify(
  code: PdfOmrErrorCode,
  reason: string | undefined,
  predicted: OmrScoreDraft | undefined,
  expected: OmrScoreDraft | undefined,
): z.infer<typeof topologyClassificationSchema> {
  if (code === "ENGINE_EXECUTION_FAILED" || code === "ENGINE_UNAVAILABLE") return "engine-failure";
  if (reason === "empty-page-part" || reason === "empty-part") return "empty-part";
  if (reason === "part-role-unresolved") return "unresolved-role";
  if (predicted === undefined || expected === undefined) return "other-failure";

  const partSummaries = predicted.parts.map(summarizePart);
  if (partSummaries.some((part) => part.measureCountsByStaff.every((measureCount) => measureCount === 0))) {
    return "empty-part";
  }
  const predictedStaffCount = partSummaries.reduce((total, part) => total + part.staffCount, 0);
  const expectedStaffCount = expected.parts.reduce((total, part) => total + part.staves.length, 0);
  if (predictedStaffCount <= expectedStaffCount) return "unresolved-role";
  if (partSummaries.some((part) => part.eventCount === 0)) return "header-only-extra-part";

  const fingerprints = partSummaries.map((part) => part.musicalFactsSha256);
  if (new Set(fingerprints).size < fingerprints.length) return "duplicate-extra-part";
  return "contentful-extra-part";
}

function summarizePredicted(draft: OmrScoreDraft): {
  partCount: number;
  staffCount: number;
  parts: z.infer<typeof partEvidenceSchema>[];
} {
  const parts = draft.parts.map(summarizePart);
  return {
    partCount: parts.length,
    staffCount: parts.reduce((total, part) => total + part.staffCount, 0),
    parts,
  };
}

function summarizePart(part: OmrScoreDraft["parts"][number]): z.infer<typeof partEvidenceSchema> {
  const measures = part.staves.flatMap((staff) => staff.measures);
  const voices = measures.flatMap((measure) => measure.voices);
  const events = voices.flatMap((voice) => voice.events);
  const pitches = events.flatMap((event) =>
    event.type !== "rest" && event.soundingMidi !== undefined ? [event.soundingMidi] : [],
  );
  const clefs = [
    ...new Set(
      measures.flatMap((measure) => (measure.clef === undefined ? [] : [canonicalJson(measure.clef).trimEnd()])),
    ),
  ].sort();
  const musicalFacts = part.staves.map((staff) =>
    staff.measures.map((measure) => ({
      ...(measure.timeSignature === undefined ? {} : { timeSignature: measure.timeSignature }),
      ...(measure.duration === undefined ? {} : { duration: measure.duration }),
      ...(measure.keySignature === undefined ? {} : { keySignature: measure.keySignature }),
      ...(measure.clef === undefined ? {} : { clef: measure.clef }),
      ...(measure.repeat === undefined ? {} : { repeat: measure.repeat }),
      voices: measure.voices.map((voice) => ({
        index: voice.index,
        events: voice.events.map((event) => ({
          type: event.type,
          onset: event.onset,
          duration: event.duration,
          ...(event.type === "rest"
            ? {}
            : {
                ...(event.writtenPitch === undefined ? {} : { writtenPitch: event.writtenPitch }),
                ...(event.soundingMidi === undefined ? {} : { soundingMidi: event.soundingMidi }),
                ...(event.tie === undefined ? {} : { tie: event.tie }),
                ...(event.tuplet === undefined ? {} : { tuplet: event.tuplet }),
              }),
        })),
      })),
    })),
  );
  return partEvidenceSchema.parse({
    partId: part.id,
    staffCount: part.staves.length,
    measureCountsByStaff: part.staves.map((staff) => staff.measures.length),
    voiceCount: voices.length,
    eventCount: events.length,
    pitchedEventCount: events.filter((event) => event.type !== "rest").length,
    restEventCount: events.filter((event) => event.type === "rest").length,
    clefs,
    ...(pitches.length === 0
      ? {}
      : {
          minimumSoundingMidi: Math.min(...pitches),
          maximumSoundingMidi: Math.max(...pitches),
        }),
    musicalFactsSha256: hashCanonical(musicalFacts),
  });
}

function summarizeExpectedTopology(draft: OmrScoreDraft): {
  partCount: number;
  staffCount: number;
  staffCountsByPart: number[];
} {
  const staffCountsByPart = draft.parts.map((part) => part.staves.length);
  return {
    partCount: draft.parts.length,
    staffCount: staffCountsByPart.reduce((total, count) => total + count, 0),
    staffCountsByPart,
  };
}

function safeReason(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return undefined;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) return undefined;
  return value;
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}
