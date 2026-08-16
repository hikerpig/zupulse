import { z } from "zod";
import { scoreIdentitySchema } from "../score/schemas";
import { localPlaybackResumeSchema, sidecarPayloadSchema } from "../storage/schemas";
import {
  libraryMetadataSchema,
  libraryPracticeSummarySchema,
  libraryScoreIdSchema,
  libraryScoreIdentitySchema,
} from "../library/schemas";
import { harmonyAnalysisDocumentSchema } from "../harmony/schemas";

export const BRIDGE_SCHEMA_VERSION = "3.0.0" as const;
const idSchema = z.string().min(1).max(128);
const secureExternalUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.username === "" && url.password === "";
    } catch {
      return false;
    }
  }, "External URLs must use HTTPS without embedded credentials");
export const recognitionProviderIdSchema = z.enum(["audiveris", "rokot", "legato", "transcoda"]);
export const recognitionProviderIssueCodeSchema = z.enum([
  "missing-configuration",
  "resource-unreadable",
  "executable-version-mismatch",
  "repository-revision-mismatch",
  "model-hash-mismatch",
  "checkpoint-hash-mismatch",
  "converter-unavailable",
  "inspection-failed",
  "persistence-failed",
]);
const recognitionInputKindSchema = z.enum(["pdf", "image"]);
const recognitionResourceKindSchema = z.enum(["executable", "file", "directory"]);
const safeResourceLabelSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/]/.test(value), {
    message: "resource labels must not contain paths",
  });
const manualResourcePathSchema = z.string().trim().min(1).max(4096);
const recognitionCandidateFieldSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("saved") }).strict(),
  z.object({ source: z.literal("selection"), selectionToken: idSchema }).strict(),
]);
const recognitionResourceSelectionRequestSchema = z.discriminatedUnion("providerId", [
  z
    .object({
      providerId: z.literal("audiveris"),
      fieldId: z.literal("executable"),
      path: manualResourcePathSchema.optional(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("rokot"),
      fieldId: z.enum(["llamaCli", "model", "visionProjector", "python"]),
      path: manualResourcePathSchema.optional(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("legato"),
      fieldId: z.enum(["python", "repository", "model", "baseModel"]),
      path: manualResourcePathSchema.optional(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("transcoda"),
      fieldId: z.enum(["python", "repository", "checkpoint"]),
      path: manualResourcePathSchema.optional(),
    })
    .strict(),
]);
const recognitionSaveRequestSchema = z.discriminatedUnion("providerId", [
  z
    .object({
      providerId: z.literal("audiveris"),
      fields: z.object({ executable: recognitionCandidateFieldSchema }).strict(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("rokot"),
      fields: z
        .object({
          llamaCli: recognitionCandidateFieldSchema,
          model: recognitionCandidateFieldSchema,
          visionProjector: recognitionCandidateFieldSchema,
          python: recognitionCandidateFieldSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("legato"),
      fields: z
        .object({
          python: recognitionCandidateFieldSchema,
          repository: recognitionCandidateFieldSchema,
          model: recognitionCandidateFieldSchema,
          baseModel: recognitionCandidateFieldSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      providerId: z.literal("transcoda"),
      fields: z
        .object({
          python: recognitionCandidateFieldSchema,
          repository: recognitionCandidateFieldSchema,
          checkpoint: recognitionCandidateFieldSchema,
        })
        .strict(),
    })
    .strict(),
]);
const recognitionProviderSummarySchema = z
  .object({
    id: recognitionProviderIdSchema,
    state: z.enum(["unconfigured", "checking", "ready", "needs-attention"]),
    version: z.string().min(1).optional(),
    inputKinds: z.array(recognitionInputKindSchema).min(1).max(2),
    reason: recognitionProviderIssueCodeSchema.optional(),
    hasExplicitConfiguration: z.boolean(),
    fields: z
      .array(
        z
          .object({
            id: z.string().min(1).max(32),
            label: safeResourceLabelSchema,
            kind: recognitionResourceKindSchema,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
const pdfOmrEngineAvailabilityReasonSchema = z.enum([
  "missing-transcoda-configuration",
  "missing-legato-configuration",
  "missing-rokot-configuration",
  "engine-executable-unavailable",
  "engine-inspection-failed",
  "checkpoint-unreadable",
  "repository-revision-mismatch",
  "checkpoint-hash-mismatch",
  "python-version-mismatch",
  "model-unreadable",
  "base-model-unreadable",
  "base-model-config-empty",
  "mmproj-unreadable",
  "model-hash-mismatch",
  "mmproj-hash-mismatch",
  "llama-build-mismatch",
  "abc-converter-unavailable",
  "invalid-version-output",
]);
export const localePreferenceSchema = z.enum(["system", "zh-CN", "en-US"]);
export const localeStateSchema = z
  .object({
    preference: localePreferenceSchema,
    effectiveLocale: z.enum(["zh-CN", "en-US"]),
  })
  .strict();
const envelope = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z
    .object({
      bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
      correlationId: idSchema,
      type: z.literal(type),
      payload,
    })
    .strict();
const libraryScoreSchema = z
  .object({
    id: libraryScoreIdSchema,
    scoreIdentity: libraryScoreIdentitySchema,
    fileName: z.string().min(1),
    format: z.enum(["gp", "musicxml"]),
    title: z.string(),
    artist: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    importedAt: z.iso.datetime(),
    lastOpenedAt: z.iso.datetime().optional(),
    isFavorite: z.boolean(),
    practice: libraryPracticeSummarySchema,
    parsedTitle: z.string().optional(),
    parsedArtist: z.string().optional(),
    metadata: libraryMetadataSchema,
  })
  .strict();
const libraryScoreSummarySchema = libraryScoreSchema.omit({ parsedTitle: true, parsedArtist: true, metadata: true });
const libraryDraftSchema = z
  .object({
    id: libraryScoreIdSchema,
    scoreIdentity: libraryScoreIdentitySchema,
    file: z.object({ fileName: z.string().min(1).max(255), bytes: z.instanceof(Uint8Array) }).strict(),
    format: z.enum(["gp", "musicxml"]),
    parsedTitle: z.string().optional(),
    parsedArtist: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
    importedAt: z.iso.datetime(),
  })
  .strict();

export const bridgeErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string(),
    recoverable: z.boolean(),
    details: z.unknown().optional(),
  })
  .strict();

export const capabilitiesSchema = z
  .object({
    pdfOmrWorkbench: z.boolean().optional(),
    recognitionProviderSettings: z.boolean().optional(),
    pdfOmrEngines: z
      .array(
        z
          .object({
            id: idSchema,
            version: z.string().min(1),
            available: z.boolean(),
            inputKinds: z
              .array(z.enum(["pdf", "image"]))
              .min(1)
              .max(2),
            reason: pdfOmrEngineAvailabilityReasonSchema.optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    fileAccess: z
      .object({
        openExternalFile: z.boolean(),
        persistentFileReferences: z.boolean(),
        localLibraryImport: z.boolean(),
        droppedFileImport: z.boolean().optional(),
      })
      .strict(),
    harmonyAnalysis: z.boolean().optional(),
    storage: z
      .object({
        sqliteIndex: z.boolean(),
        sidecarPayload: z.boolean(),
      })
      .strict(),
    sync: z
      .object({
        available: z.boolean(),
        provider: z.enum(["none", "custom"]),
      })
      .strict(),
    audio: z
      .object({
        webAudio: z.boolean(),
        nativeBridge: z.boolean(),
      })
      .strict(),
    localization: z
      .object({
        changeLocale: z.boolean(),
      })
      .strict(),
    externalNavigation: z
      .object({
        openUrl: z.boolean(),
      })
      .strict(),
    telemetry: z
      .object({
        available: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const hostDiagnosticOperationSchema = z.enum([
  "app.runtime",
  "bridge.dispatch",
  "library.refresh",
  "library.import.select",
  "library.open",
  "playback-resume.read",
  "renderer.load",
  "renderer.preload",
  "sidecar.read",
  "studio.open",
  "studio.preview",
  "viewer.operation",
]);

const pdfOmrStageSchema = z.enum(["inspect", "recognize", "validate", "export"]);
const pdfOmrProgressSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sequence: z.number().int().nonnegative(),
    kind: z.enum(["stage", "engine-progress", "terminal"]),
    stage: pdfOmrStageSchema.optional(),
    status: z.enum(["started", "completed", "succeeded", "cancelled", "failed"]).optional(),
    unit: z.enum(["page", "system"]).optional(),
    completed: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
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
const pdfOmrJobSnapshotSchema = z
  .object({
    jobId: idSchema,
    status: z.enum(["ready", "running", "cancelling", "cancelled", "failed", "succeeded"]),
    stage: pdfOmrStageSchema.optional(),
    input: z
      .object({
        fileName: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
        inputKind: z.enum(["pdf", "image"]),
        pageCount: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    engine: z
      .object({
        id: idSchema,
        version: z.string().min(1),
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
        code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
        recoverable: z.boolean(),
        reason: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,63}$/)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const pdfOmrReadinessSchema = z.enum(["blocked", "ready-with-warnings", "ready"]);
const pdfOmrWrittenPitchSchema = z
  .object({
    step: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
    alter: z.number().int().min(-2).max(2),
    octave: z.number().int().min(-1).max(9),
  })
  .strict();
const pdfOmrMidiAnalysisSchema = z
  .object({
    midiFileName: z.string().min(1).max(255),
    compatibility: z
      .object({
        status: z.enum(["compatible", "ambiguous", "incompatible"]),
        scoreCoverage: z.number().finite().min(0).max(1),
        midiCoverage: z.number().finite().min(0).max(1),
        pitchAgreement: z.number().finite().min(0).max(1),
      })
      .strict(),
    proposals: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type: z.enum(["pitch-disagreement", "midi-supported-missing-note", "unsupported-score-note"]),
            confidence: z.number().finite().min(0).max(1),
            reviewability: z
              .object({ status: z.enum(["writeback-ready", "review-only"]), reasons: z.array(z.string().min(1)) })
              .strict(),
            measureIndex: z.number().int().nonnegative().optional(),
            before: pdfOmrWrittenPitchSchema.optional(),
            suggestedSoundingMidi: z.number().int().min(0).max(127).optional(),
          })
          .strict(),
      )
      .max(512),
  })
  .strict();
const pdfOmrValidationViewSchema = z
  .object({
    readiness: z.object({ harmony: pdfOmrReadinessSchema, musicXml: pdfOmrReadinessSchema }).strict(),
    diagnostics: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
            severity: z.enum(["blocking", "warning", "info"]),
          })
          .strict(),
      )
      .max(512),
  })
  .strict();
const pdfOmrResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable") }).strict(),
  z
    .object({
      status: z.literal("available"),
      fileName: z.string().min(1),
      bytes: z.instanceof(Uint8Array),
      outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
      validation: pdfOmrValidationViewSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed-validation"),
      validation: pdfOmrValidationViewSchema,
    })
    .strict(),
]);

export const diagnosticEventSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    operation: hostDiagnosticOperationSchema.optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
    durationMs: z.number().nonnegative().optional(),
    contentHashPrefix: z
      .string()
      .regex(/^[a-f0-9]{8,16}$/)
      .optional(),
  })
  .strict();

export const bridgeRequestSchema = z.discriminatedUnion("type", [
  envelope(
    "app.handshake",
    z
      .object({
        appVersion: z.string(),
        rendererBuildHash: idSchema,
      })
      .strict(),
  ),
  envelope("app.locale.setPreference", z.object({ preference: localePreferenceSchema }).strict()),
  envelope("app.telemetry.setPreference", z.object({ enabled: z.boolean() }).strict()),
  envelope("external.openUrl", z.object({ url: secureExternalUrlSchema }).strict()),
  envelope("recognitionSettings.list", z.object({}).strict()),
  envelope("recognitionSettings.selectResource", recognitionResourceSelectionRequestSchema),
  envelope("recognitionSettings.save", recognitionSaveRequestSchema),
  envelope("recognitionSettings.clear", z.object({ providerId: recognitionProviderIdSchema }).strict()),
  envelope("file.select", z.object({ multiple: z.boolean() }).strict()),
  envelope("file.readBytes", z.object({ fileToken: idSchema }).strict()),
  envelope("pdfOmr.select", z.object({}).strict()),
  envelope("pdfOmr.start", z.object({ fileToken: idSchema, engineId: idSchema }).strict()),
  envelope("pdfOmr.retry", z.object({ jobId: idSchema, engineId: idSchema }).strict()),
  envelope("pdfOmr.cancel", z.object({ jobId: idSchema }).strict()),
  envelope("pdfOmr.getSnapshot", z.object({}).strict()),
  envelope("pdfOmr.readResult", z.object({ jobId: idSchema }).strict()),
  envelope("pdfOmr.selectMidi", z.object({}).strict()),
  envelope("pdfOmr.analyzeMidi", z.object({ jobId: idSchema, fileToken: idSchema }).strict()),
  envelope(
    "pdfOmr.applyMidiCorrections",
    z
      .object({
        jobId: idSchema,
        decisions: z
          .array(z.object({ proposalId: idSchema, writtenPitch: pdfOmrWrittenPitchSchema }).strict())
          .min(1)
          .max(512),
      })
      .strict(),
  ),
  envelope("file.save", z.object({ fileName: z.string().min(1).max(255), bytes: z.instanceof(Uint8Array) }).strict()),
  envelope("library.list", z.object({}).strict()),
  envelope("library.get", z.object({ id: libraryScoreIdSchema }).strict()),
  envelope("library.find", z.object({ scoreIdentity: libraryScoreIdentitySchema }).strict()),
  envelope("library.add", z.object({ draft: libraryDraftSchema }).strict()),
  envelope("library.readScore", z.object({ id: libraryScoreIdSchema }).strict()),
  envelope("library.updateMetadata", z.object({ id: libraryScoreIdSchema, patch: libraryMetadataSchema }).strict()),
  envelope("library.setFavorite", z.object({ id: libraryScoreIdSchema, favorite: z.boolean() }).strict()),
  envelope("library.markOpened", z.object({ id: libraryScoreIdSchema, openedAt: z.iso.datetime() }).strict()),
  envelope("library.delete", z.object({ id: libraryScoreIdSchema }).strict()),
  envelope("harmonyAnalysis.read", z.object({ libraryScoreId: libraryScoreIdSchema }).strict()),
  envelope(
    "harmonyAnalysis.save",
    z
      .object({
        document: harmonyAnalysisDocumentSchema,
        expectedDocumentVersion: z.number().int().nonnegative().nullable(),
      })
      .strict(),
  ),
  envelope(
    "sidecar.read",
    z.object({ identity: scoreIdentitySchema, libraryScoreId: libraryScoreIdSchema.optional() }).strict(),
  ),
  envelope(
    "sidecar.write",
    z
      .object({
        identity: scoreIdentitySchema,
        libraryScoreId: libraryScoreIdSchema.optional(),
        payload: sidecarPayloadSchema,
      })
      .strict(),
  ),
  envelope(
    "playbackResume.read",
    z.object({ identity: scoreIdentitySchema, libraryScoreId: libraryScoreIdSchema.optional() }).strict(),
  ),
  envelope(
    "playbackResume.write",
    z
      .object({
        identity: scoreIdentitySchema,
        libraryScoreId: libraryScoreIdSchema.optional(),
        resume: localPlaybackResumeSchema,
      })
      .strict(),
  ),
  envelope(
    "app.lifecycleAck",
    z
      .object({
        state: z.enum(["suspend", "prepare-close"]),
      })
      .strict(),
  ),
  envelope("diagnostics.write", diagnosticEventSchema),
]);

export const bridgeEventSchema = z.discriminatedUnion("type", [
  envelope(
    "app.command",
    z
      .object({
        command: z.enum(["open-score", "toggle-playback"]),
      })
      .strict(),
  ),
  envelope(
    "app.lifecycle",
    z
      .object({
        state: z.enum(["suspend", "prepare-close"]),
      })
      .strict(),
  ),
  envelope(
    "storage.warning",
    z
      .object({
        code: z.literal("CORRUPT_PERSISTED_DATA"),
        category: z.enum(["sidecar", "resume"]),
      })
      .strict(),
  ),
  envelope("pdfOmr.progress", z.object({ jobId: idSchema, event: pdfOmrProgressSchema }).strict()),
]);

export const IPAD_BRIDGE_REQUEST_TYPES = [
  "app.handshake",
  "app.lifecycleAck",
  "diagnostics.write",
  "file.select",
] as const satisfies readonly BridgeRequest["type"][];
export const IPAD_BRIDGE_EVENT_TYPES = [
  "app.command",
  "app.lifecycle",
] as const satisfies readonly BridgeEvent["type"][];

export const ipadBridgeRequestSchema = bridgeRequestSchema.refine(
  (request) => (IPAD_BRIDGE_REQUEST_TYPES as readonly string[]).includes(request.type),
  { message: "Unsupported iPad Bridge request type" },
);
export const ipadBridgeEventSchema = bridgeEventSchema.refine(
  (event) => (IPAD_BRIDGE_EVENT_TYPES as readonly string[]).includes(event.type),
  { message: "Unsupported iPad Bridge event type" },
);
export const ipadBridgeEnvelopeSchema = z
  .object({
    bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
    correlationId: idSchema,
    type: z.enum([...IPAD_BRIDGE_REQUEST_TYPES, ...IPAD_BRIDGE_EVENT_TYPES]),
    payload: z.unknown(),
  })
  .strict();

export const bridgeResponseSchemas = {
  "app.handshake": z
    .object({
      appVersion: z.string(),
      bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
      rendererBuildHash: idSchema,
      capabilities: capabilitiesSchema,
      locale: localeStateSchema,
      telemetry: z
        .object({
          schemaVersion: z.literal(1),
          enabled: z.boolean(),
          noticeAcknowledged: z.boolean(),
          installationId: z.uuid().optional(),
          applicationSessionId: z.uuid().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  "app.locale.setPreference": localeStateSchema,
  "app.telemetry.setPreference": z
    .object({
      schemaVersion: z.literal(1),
      enabled: z.boolean(),
      noticeAcknowledged: z.boolean(),
      installationId: z.uuid().optional(),
      applicationSessionId: z.uuid().optional(),
    })
    .strict(),
  "external.openUrl": z.object({}).strict(),
  "recognitionSettings.list": z.object({ providers: z.array(recognitionProviderSummarySchema).length(4) }).strict(),
  "recognitionSettings.selectResource": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z
      .object({
        status: z.literal("selected"),
        selectionToken: idSchema,
        label: safeResourceLabelSchema,
        kind: recognitionResourceKindSchema,
      })
      .strict(),
  ]),
  "recognitionSettings.save": recognitionProviderSummarySchema,
  "recognitionSettings.clear": recognitionProviderSummarySchema,
  "file.select": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z
      .object({
        status: z.literal("selected"),
        files: z
          .array(
            z
              .object({ fileToken: idSchema, fileName: z.string().min(1), sizeBytes: z.number().int().nonnegative() })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  ]),
  "file.readBytes": z
    .object({
      fileName: z.string().min(1),
      bytes: z.instanceof(Uint8Array),
    })
    .strict(),
  "pdfOmr.select": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z
      .object({
        status: z.literal("selected"),
        fileToken: idSchema,
        fileName: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
        inputKind: z.enum(["pdf", "image"]),
      })
      .strict(),
  ]),
  "pdfOmr.start": z.object({ jobId: idSchema, snapshot: pdfOmrJobSnapshotSchema }).strict(),
  "pdfOmr.retry": z.object({ jobId: idSchema, snapshot: pdfOmrJobSnapshotSchema }).strict(),
  "pdfOmr.cancel": z.object({}).strict(),
  "pdfOmr.getSnapshot": z.object({ snapshot: pdfOmrJobSnapshotSchema.nullable() }).strict(),
  "pdfOmr.readResult": pdfOmrResultSchema,
  "pdfOmr.selectMidi": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z
      .object({
        status: z.literal("selected"),
        fileToken: idSchema,
        fileName: z.string().min(1).max(255),
        sizeBytes: z.number().int().nonnegative(),
      })
      .strict(),
  ]),
  "pdfOmr.analyzeMidi": pdfOmrMidiAnalysisSchema,
  "pdfOmr.applyMidiCorrections": z.object({ appliedCount: z.number().int().positive() }).strict(),
  "file.save": z.object({ status: z.enum(["saved", "cancelled"]) }).strict(),
  "library.list": z.object({ scores: z.array(libraryScoreSummarySchema) }).strict(),
  "library.get": z.object({ score: libraryScoreSchema.optional() }).strict(),
  "library.find": z.object({ score: libraryScoreSchema.optional() }).strict(),
  "library.add": z.object({ status: z.enum(["created", "existing"]), score: libraryScoreSchema }).strict(),
  "library.readScore": z.object({ fileName: z.string().min(1), bytes: z.instanceof(Uint8Array) }).strict(),
  "library.updateMetadata": z.object({ score: libraryScoreSchema }).strict(),
  "library.setFavorite": z.object({}).strict(),
  "library.markOpened": z.object({}).strict(),
  "library.delete": z.object({}).strict(),
  "harmonyAnalysis.read": z.object({ document: harmonyAnalysisDocumentSchema.nullable() }).strict(),
  "harmonyAnalysis.save": z.discriminatedUnion("status", [
    z.object({ status: z.literal("saved"), document: harmonyAnalysisDocumentSchema }).strict(),
    z.object({ status: z.literal("conflict"), current: harmonyAnalysisDocumentSchema.nullable() }).strict(),
  ]),
  "sidecar.read": z.object({ payload: sidecarPayloadSchema.optional() }).strict(),
  "sidecar.write": z.object({}).strict(),
  "playbackResume.read": z.object({ resume: localPlaybackResumeSchema.optional() }).strict(),
  "playbackResume.write": z.object({}).strict(),
  "app.lifecycleAck": z.object({}).strict(),
  "diagnostics.write": z.object({}).strict(),
} as const;

export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type BridgeError = z.infer<typeof bridgeErrorSchema>;
export type PdfOmrProgressEvent = z.infer<typeof pdfOmrProgressSchema>;
export type PdfOmrJobSnapshot = z.infer<typeof pdfOmrJobSnapshotSchema>;
export type RecognitionProviderId = z.infer<typeof recognitionProviderIdSchema>;
export type RecognitionProviderIssueCode = z.infer<typeof recognitionProviderIssueCodeSchema>;
export type RecognitionProviderSummary = z.infer<typeof recognitionProviderSummarySchema>;
export type BridgeRequestType = BridgeRequest["type"];
export type BridgeResponse<T extends BridgeRequestType> = z.infer<(typeof bridgeResponseSchemas)[T]>;

type RequestFor<T extends BridgeRequestType> = Extract<BridgeRequest, { type: T }>;
type BridgeEventType = BridgeEvent["type"];
type EventFor<T extends BridgeEventType> = Extract<BridgeEvent, { type: T }>;

export function createBridgeRequest<T extends BridgeRequestType>(
  type: T,
  correlationId: string,
  payload: RequestFor<T>["payload"],
): RequestFor<T> {
  return bridgeRequestSchema.parse({
    bridgeVersion: BRIDGE_SCHEMA_VERSION,
    correlationId,
    type,
    payload,
  }) as RequestFor<T>;
}

export function parseBridgeResponse<T extends BridgeRequestType>(type: T, value: unknown): BridgeResponse<T> {
  return bridgeResponseSchemas[type].parse(value) as BridgeResponse<T>;
}

export function createBridgeEvent<T extends BridgeEventType>(
  type: T,
  correlationId: string,
  payload: EventFor<T>["payload"],
): EventFor<T> {
  return bridgeEventSchema.parse({
    bridgeVersion: BRIDGE_SCHEMA_VERSION,
    correlationId,
    type,
    payload,
  }) as EventFor<T>;
}

const droppedTokenFileSchema = z
  .object({ fileToken: idSchema, fileName: z.string().min(1), sizeBytes: z.number().int().nonnegative() })
  .strict();

export const fileImportDroppedRequestSchema = envelope(
  "file.importDropped",
  z
    .object({
      paths: z.array(z.string().min(1)).min(1).max(128),
    })
    .strict(),
);

export const fileImportDroppedResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("cancelled") }).strict(),
  z
    .object({
      status: z.literal("accepted"),
      files: z.array(droppedTokenFileSchema).min(1),
    })
    .strict(),
]);

export type FileImportDroppedRequest = z.infer<typeof fileImportDroppedRequestSchema>;
export type FileImportDroppedResponse = z.infer<typeof fileImportDroppedResponseSchema>;
