import {
  createPaperSemiCrfLabelInventory,
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  scoreWrittenMomentSchema,
  scoreWrittenRangeSchema,
} from "@zupulse/web-core";
import { z } from "zod";

const finiteNumberSchema = z.number().refine(Number.isFinite, "number must be finite");
const nonnegativeSafeIntegerSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);
const positiveSafeIntegerSchema = z.number().int().positive().refine(Number.isSafeInteger);

const paperSemiCrfEventNoteSchema = z
  .object({
    id: z.string().min(1),
    trackId: z.string().min(1),
    staffIndex: nonnegativeSafeIntegerSchema,
    voice: nonnegativeSafeIntegerSchema,
    onset: scoreWrittenMomentSchema,
    onsetTick: nonnegativeSafeIntegerSchema,
    soundingPitchClass: z.number().int().min(0).max(11),
    durationTicks: positiveSafeIntegerSchema,
    sourceDurationTicks: positiveSafeIntegerSchema,
    heldFromPrevious: z.boolean(),
    metricAccent: finiteNumberSchema.nonnegative(),
    isBass: z.boolean(),
    soundingMidi: z.number().int().min(0).max(127).optional(),
    spelling: z
      .object({
        step: z.enum(["C", "D", "E", "F", "G", "A", "B"]),
        alter: z.number().int(),
      })
      .strict()
      .optional(),
  })
  .strict();

const paperSemiCrfEventSchema = z
  .object({
    index: nonnegativeSafeIntegerSchema,
    range: scoreWrittenRangeSchema,
    startTick: nonnegativeSafeIntegerSchema,
    endTick: positiveSafeIntegerSchema,
    durationTicks: positiveSafeIntegerSchema,
    metricAccent: finiteNumberSchema.nonnegative(),
    notes: z.array(paperSemiCrfEventNoteSchema),
    bassPitchClass: z.number().int().min(0).max(11).optional(),
  })
  .strict()
  .refine((event) => event.endTick - event.startTick === event.durationTicks, {
    message: "event duration must match its tick range",
  });

const paperSemiCrfTargetSegmentSchema = z
  .object({
    startEvent: nonnegativeSafeIntegerSchema,
    endEvent: positiveSafeIntegerSchema,
    label: z.string().min(1),
  })
  .strict();

const paperSemiCrfRecordSchema = z
  .object({
    id: z.string().min(1),
    corpus: z.string().min(1),
    groupId: z.string().min(1),
    events: z.array(paperSemiCrfEventSchema).min(1),
    targetSegments: z.array(paperSemiCrfTargetSegmentSchema).min(1),
  })
  .strict();

export const paperSemiCrfRecordsFileSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-records-v1"),
    command: z.literal("paper-semi-crf-records"),
    role: z.enum(["train", "tune", "final"]),
    labelMappingVersion: z.literal(PAPER_SEMI_CRF_LABEL_MAPPING_VERSION),
    featureVersion: z.literal(PAPER_SEMI_CRF_FEATURE_VERSION),
    labels: z.array(z.string().min(1)).min(1),
    maxSegmentLength: positiveSafeIntegerSchema,
    records: z.array(paperSemiCrfRecordSchema).min(1),
  })
  .strict()
  .superRefine((file, context) => {
    if (new Set(file.labels).size !== file.labels.length) {
      context.addIssue({ code: "custom", path: ["labels"], message: "labels must be unique" });
    }
    const inventory = createPaperSemiCrfLabelInventory(file.labels);
    if (inventory.labels.some((label) => label.status === "unsupported")) {
      context.addIssue({ code: "custom", path: ["labels"], message: "labels must map to ChordSymbol" });
    }
    const labels = new Set(file.labels);
    const ids = new Set<string>();
    for (const [recordIndex, record] of file.records.entries()) {
      if (ids.has(record.id)) {
        context.addIssue({
          code: "custom",
          path: ["records", recordIndex, "id"],
          message: "record ids must be unique",
        });
      }
      ids.add(record.id);
      for (const [eventIndex, event] of record.events.entries()) {
        if (
          event.index !== eventIndex ||
          (eventIndex > 0 && event.startTick !== record.events[eventIndex - 1]!.endTick)
        ) {
          context.addIssue({
            code: "custom",
            path: ["records", recordIndex, "events", eventIndex],
            message: "events must be contiguous",
          });
        }
      }
      let nextStart = 0;
      for (const [segmentIndex, segment] of record.targetSegments.entries()) {
        if (!labels.has(segment.label)) {
          context.addIssue({
            code: "custom",
            path: ["records", recordIndex, "targetSegments", segmentIndex, "label"],
            message: "target label is not in labels",
          });
        }
        if (
          segment.startEvent !== nextStart ||
          segment.endEvent <= segment.startEvent ||
          segment.endEvent - segment.startEvent > file.maxSegmentLength
        ) {
          context.addIssue({
            code: "custom",
            path: ["records", recordIndex, "targetSegments", segmentIndex],
            message: "target path must cover every event exactly once",
          });
        }
        nextStart = segment.endEvent;
      }
      if (nextStart !== record.events.length) {
        context.addIssue({
          code: "custom",
          path: ["records", recordIndex, "targetSegments"],
          message: "target path must cover every event exactly once",
        });
      }
    }
  });

export type PaperSemiCrfRecordsFile = z.infer<typeof paperSemiCrfRecordsFileSchema>;

export function parsePaperSemiCrfTrainingRecords(input: unknown): PaperSemiCrfRecordsFile & { role: "train" } {
  const file = paperSemiCrfRecordsFileSchema.parse(input);
  if (file.role !== "train") throw new Error("paper Semi-CRF training requires train records");
  return file;
}

export function parsePaperSemiCrfEvaluationRecords(
  input: unknown,
  options: { allowFinal?: boolean } = {},
): PaperSemiCrfRecordsFile & { role: "tune" | "final" } {
  const file = paperSemiCrfRecordsFileSchema.parse(input);
  if (file.role === "train") throw new Error("paper Semi-CRF evaluation requires tune or final records");
  if (file.role === "final" && options.allowFinal !== true) {
    throw new Error("final records require explicit authorization");
  }
  return file;
}
