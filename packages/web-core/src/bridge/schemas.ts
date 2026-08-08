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
  envelope("file.select", z.object({ multiple: z.boolean() }).strict()),
  envelope("file.readBytes", z.object({ fileToken: idSchema }).strict()),
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
    })
    .strict(),
  "app.locale.setPreference": localeStateSchema,
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
