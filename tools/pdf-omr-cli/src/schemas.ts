import { z } from "zod";
import { pdfOmrErrorCodes } from "./errors";

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.iso.datetime();

export const pdfOmrHelpReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("help"),
    usage: z.string().min(1),
  })
  .strict();
export type PdfOmrHelpReport = z.infer<typeof pdfOmrHelpReportSchema>;

export const pdfOmrInspectReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("inspect"),
    source: z
      .object({
        fileName: z.string().min(1),
        sha256: sha256Schema,
        sizeBytes: z.number().int().nonnegative(),
      })
      .strict(),
    pageCount: z.number().int().nonnegative(),
    pages: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
          vectorOperators: z.number().int().nonnegative(),
          rasterOperators: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine((report) => report.pageCount === report.pages.length, {
    message: "pageCount must match pages length",
    path: ["pageCount"],
  });
export type PdfOmrInspectReport = z.infer<typeof pdfOmrInspectReportSchema>;

export const pdfOmrRecognizeReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("recognize"),
    status: z.literal("succeeded"),
    runId: z.string().min(1),
    inputSha256: sha256Schema,
    draftSha256: sha256Schema,
  })
  .strict();
export type PdfOmrRecognizeReport = z.infer<typeof pdfOmrRecognizeReportSchema>;

export const pdfOmrAnalyzeReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("analyze"),
    status: z.literal("succeeded"),
    outputSha256: sha256Schema,
  })
  .strict();
export type PdfOmrAnalyzeReport = z.infer<typeof pdfOmrAnalyzeReportSchema>;

const readinessSchema = z.enum(["blocked", "ready-with-warnings", "ready"]);
export const pdfOmrValidateReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("validate"),
    readiness: z.object({ harmony: readinessSchema, musicXml: readinessSchema }).strict(),
    outputSha256: sha256Schema,
  })
  .strict();
export type PdfOmrValidateReport = z.infer<typeof pdfOmrValidateReportSchema>;

export const pdfOmrExportReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("export-musicxml"),
    status: z.literal("succeeded"),
    outputSha256: sha256Schema,
    structural: z.literal(true),
  })
  .strict();
export type PdfOmrExportReport = z.infer<typeof pdfOmrExportReportSchema>;

export const pdfOmrBenchmarkReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("benchmark"),
    status: z.literal("succeeded"),
    reportSha256: sha256Schema,
    gateEvaluated: z.boolean(),
    gatePassed: z.boolean().optional(),
  })
  .strict();
export type PdfOmrBenchmarkReport = z.infer<typeof pdfOmrBenchmarkReportSchema>;

export const pdfOmrErrorReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("error"),
    error: z
      .object({
        code: z.enum(pdfOmrErrorCodes),
        message: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const parameterValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
export const omrEngineEnvironmentSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    executable: z.string().min(1),
    modelSha256: sha256Schema.optional(),
    license: z
      .object({
        id: z.string().min(1),
        source: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const omrRunManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    corpusItemId: z.string().min(1).optional(),
    inputSha256: sha256Schema,
    engine: z
      .object({
        id: z.string().min(1),
        version: z.string().min(1),
        modelSha256: sha256Schema.optional(),
      })
      .strict(),
    parameters: z.record(z.string(), parameterValueSchema),
    preprocess: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
    startedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
    status: z.enum(["running", "succeeded", "failed", "cancelled"]),
    artifactSha256: z.record(z.string().min(1), sha256Schema),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.status === "running" && manifest.completedAt !== undefined) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "running run cannot be complete" });
    }
    if (manifest.status !== "running" && manifest.completedAt === undefined) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "terminal run requires completedAt" });
    }
  });

export const rationalSchema = z
  .object({
    numerator: z.number().int(),
    denominator: z.number().int().positive(),
  })
  .strict();

const sourceAnchorSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    systemIndex: z.number().int().nonnegative().optional(),
    bbox: z
      .object({
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

const writtenPitchSchema = z
  .object({
    step: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
    alter: z.number().int().min(-2).max(2),
    octave: z.number().int().min(-1).max(9),
  })
  .strict();

const eventBase = {
  id: z.string().min(1),
  onset: rationalSchema.refine((value) => value.numerator >= 0, "onset must be nonnegative"),
  duration: rationalSchema.refine((value) => value.numerator > 0, "duration must be positive"),
  confidence: z.number().min(0).max(1).optional(),
  source: sourceAnchorSchema.optional(),
};

const noteSchema = z
  .object({
    type: z.literal("note"),
    ...eventBase,
    writtenPitch: writtenPitchSchema.optional(),
    soundingMidi: z.number().int().min(0).max(127).optional(),
    tie: z.enum(["start", "continue", "end"]).optional(),
    tuplet: z
      .object({
        actualNotes: z.number().int().positive(),
        normalNotes: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

const restSchema = z
  .object({
    type: z.literal("rest"),
    ...eventBase,
  })
  .strict();

const diagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "blocking"]),
    message: z.string().min(1),
    source: sourceAnchorSchema.optional(),
  })
  .strict();

export const omrScoreDraftSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    provenance: z
      .object({
        engine: z
          .object({
            id: z.string().min(1),
            version: z.string().min(1),
            modelSha256: sha256Schema.optional(),
          })
          .strict(),
        inputSha256: sha256Schema.optional(),
      })
      .strict()
      .optional(),
    parts: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            staves: z
              .array(
                z
                  .object({
                    index: z.number().int().nonnegative(),
                    measures: z
                      .array(
                        z
                          .object({
                            index: z.number().int().nonnegative(),
                            timeSignature: z
                              .object({
                                numerator: z.number().int().positive(),
                                denominator: z.number().int().positive(),
                              })
                              .strict()
                              .optional(),
                            duration: rationalSchema
                              .refine((value) => value.numerator > 0, "measure duration must be positive")
                              .optional(),
                            keySignature: z
                              .object({ fifths: z.number().int().min(-7).max(7) })
                              .strict()
                              .optional(),
                            clef: z
                              .object({
                                sign: z.enum(["G", "F", "C", "percussion", "TAB", "none"]),
                                line: z.number().int().positive().optional(),
                              })
                              .strict()
                              .optional(),
                            repeat: z
                              .object({
                                forward: z.boolean(),
                                backward: z.boolean(),
                              })
                              .strict()
                              .optional(),
                            voices: z.array(
                              z
                                .object({
                                  index: z.number().int().positive(),
                                  events: z.array(z.union([noteSchema, restSchema])),
                                })
                                .strict(),
                            ),
                          })
                          .strict(),
                      )
                      .min(1),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export type OmrScoreDraft = z.infer<typeof omrScoreDraftSchema>;
export type OmrRunManifest = z.infer<typeof omrRunManifestSchema>;
