import { z } from "zod";

const idSchema = z.string().min(1).max(128);
const semanticCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);

export const recognitionInputKindSchema = z.enum(["pdf", "image"]);
export const recognitionStageSchema = z.enum(["inspect", "recognize", "validate", "export"]);
export const recognitionReadinessSchema = z.enum(["blocked", "ready-with-warnings", "ready"]);

export const recognitionEngineOptionSchema = z
  .object({
    id: idSchema,
    version: z.string().min(1).max(128),
    available: z.boolean(),
    inputKinds: z.array(recognitionInputKindSchema).min(1).max(2),
    reason: z.string().min(1).max(128).optional(),
  })
  .strict();

export const recognitionProgressEventSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sequence: z.number().int().nonnegative(),
    kind: z.enum(["stage", "engine-progress", "terminal"]),
    stage: recognitionStageSchema.optional(),
    status: z.enum(["started", "completed", "succeeded", "cancelled", "failed"]).optional(),
    unit: z.enum(["page", "system"]).optional(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
    errorCode: semanticCodeSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.kind === "stage" &&
      (event.stage === undefined || !["started", "completed"].includes(event.status ?? ""))
    ) {
      context.addIssue({ code: "custom", message: "stage event requires stage and stage status" });
    }
    if (
      event.kind === "engine-progress" &&
      (event.stage !== "recognize" ||
        event.unit === undefined ||
        event.completed === undefined ||
        event.total === undefined)
    ) {
      context.addIssue({ code: "custom", message: "engine progress requires recognize counters" });
    }
    if (event.kind === "terminal" && !["succeeded", "cancelled", "failed"].includes(event.status ?? "")) {
      context.addIssue({ code: "custom", message: "terminal event requires terminal status" });
    }
    if (event.completed !== undefined && event.total !== undefined && event.completed > event.total) {
      context.addIssue({ code: "custom", message: "completed cannot exceed total" });
    }
  });

export const recognitionAttemptStatusSchema = z.enum([
  "queued",
  "running",
  "cancelling",
  "cancelled",
  "failed",
  "interrupted",
  "succeeded",
]);
export const recognitionJobStatusSchema = z.union([recognitionAttemptStatusSchema, z.literal("deleting")]);

export const recognitionInputSummarySchema = z
  .object({
    fileName: z.string().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(64 * 1024 * 1024),
    inputKind: recognitionInputKindSchema,
    pageCount: z.number().int().positive().optional(),
  })
  .strict();

export const recognitionJobSnapshotSchema = z
  .object({
    jobId: idSchema,
    attemptId: idSchema.optional(),
    attemptNumber: z.number().int().positive().optional(),
    status: recognitionJobStatusSchema,
    stage: recognitionStageSchema.optional(),
    exported: z.boolean().optional(),
    input: recognitionInputSummarySchema.optional(),
    engine: z
      .object({
        id: idSchema,
        version: z.string().min(1).max(128),
        modelSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict()
      .optional(),
    progress: z
      .object({
        unit: z.enum(["page", "system"]),
        completed: z.number().int().nonnegative(),
        total: z.number().int().positive(),
      })
      .strict()
      .optional(),
    error: z
      .object({
        code: semanticCodeSchema,
        recoverable: z.boolean(),
        reason: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,63}$/)
          .optional(),
      })
      .strict()
      .optional(),
    createdAt: z.iso.datetime().optional(),
    updatedAt: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();

export const recognitionAttemptSummarySchema = z
  .object({
    attemptId: idSchema,
    attemptNumber: z.number().int().positive(),
    status: recognitionAttemptStatusSchema,
    engineId: idSchema,
    stage: recognitionStageSchema.optional(),
    errorCode: semanticCodeSchema.optional(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().optional(),
    finishedAt: z.iso.datetime().optional(),
  })
  .strict();

export const recognitionJobSummarySchema = z
  .object({
    jobId: idSchema,
    status: recognitionJobStatusSchema,
    input: recognitionInputSummarySchema,
    attemptCount: z.number().int().positive(),
    engineId: idSchema.optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const recognitionHistoryPageSchema = z
  .object({
    items: z.array(recognitionJobSummarySchema).max(100),
    nextCursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export const recognitionJobDetailSchema = z
  .object({
    snapshot: recognitionJobSnapshotSchema,
    attempts: z.array(recognitionAttemptSummarySchema).min(1).max(256),
    result: z
      .object({
        fileName: z.string().min(1).max(255),
        outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
        validation: z
          .object({
            readiness: z.object({ harmony: recognitionReadinessSchema, musicXml: recognitionReadinessSchema }).strict(),
            diagnostics: z
              .array(
                z
                  .object({
                    code: semanticCodeSchema,
                    severity: z.enum(["blocking", "warning", "info"]),
                  })
                  .strict(),
              )
              .max(512),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const recognitionApiCapabilitiesSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    engines: z.array(recognitionEngineOptionSchema).max(16),
  })
  .strict();

export const recognitionResultSchema = recognitionJobDetailSchema.shape.result.unwrap().extend({
  bytes: z.instanceof(Uint8Array),
});

export const recognitionSseEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), snapshot: recognitionJobSnapshotSchema }).strict(),
  z
    .object({
      kind: z.literal("progress"),
      jobId: idSchema,
      attemptId: idSchema,
      event: recognitionProgressEventSchema,
    })
    .strict(),
]);

export const recognitionApiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_INPUT",
  "ENGINE_UNAVAILABLE",
  "ENGINE_EXECUTION_FAILED",
  "ENGINE_OUTPUT_INVALID",
  "DRAFT_VALIDATION_FAILED",
  "PROJECTION_OR_EXPORT_FAILED",
  "INTERRUPTED",
  "JOB_NOT_FOUND",
  "JOB_NOT_CANCELLABLE",
  "JOB_NOT_RETRYABLE",
  "JOB_DELETING",
  "STORAGE_UNAVAILABLE",
  "RESULT_PERSIST_FAILED",
  "RESULT_INTEGRITY_FAILED",
]);

export const recognitionApiErrorSchema = z
  .object({
    error: z.object({ code: recognitionApiErrorCodeSchema, recoverable: z.boolean() }).strict(),
  })
  .strict();

export type RecognitionEngineOption = z.infer<typeof recognitionEngineOptionSchema>;
export type RecognitionProgressEvent = z.infer<typeof recognitionProgressEventSchema>;
export type RecognitionJobSnapshot = z.infer<typeof recognitionJobSnapshotSchema>;
export type RecognitionAttemptSummary = z.infer<typeof recognitionAttemptSummarySchema>;
export type RecognitionJobSummary = z.infer<typeof recognitionJobSummarySchema>;
export type RecognitionHistoryPage = z.infer<typeof recognitionHistoryPageSchema>;
export type RecognitionJobDetail = z.infer<typeof recognitionJobDetailSchema>;
export type RecognitionResult = z.infer<typeof recognitionResultSchema>;
export type RecognitionSseEvent = z.infer<typeof recognitionSseEventSchema>;
export type RecognitionApiError = z.infer<typeof recognitionApiErrorSchema>;
