import { z } from "zod";
import { scoreIdentitySchema } from "../score/schemas";
import { localPlaybackResumeSchema, sidecarPayloadSchema } from "../storage/schemas";

export const BRIDGE_SCHEMA_VERSION = "1.0.0" as const;
const idSchema = z.string().min(1).max(128);
const envelope = <T extends string, S extends z.ZodType>(type: T, payload: S) => z.object({
  bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
  correlationId: idSchema,
  type: z.literal(type),
  payload,
}).strict();

export const bridgeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  recoverable: z.boolean(),
  details: z.unknown().optional(),
}).strict();

export const capabilitiesSchema = z.object({
  fileAccess: z.object({
    openExternalFile: z.boolean(),
    persistentFileReferences: z.boolean(),
    localLibraryImport: z.boolean(),
  }).strict(),
  storage: z.object({
    sqliteIndex: z.boolean(),
    sidecarPayload: z.boolean(),
  }).strict(),
  sync: z.object({
    available: z.boolean(),
    provider: z.enum(["none", "custom"]),
  }).strict(),
  audio: z.object({
    webAudio: z.boolean(),
    nativeBridge: z.boolean(),
  }).strict(),
}).strict();

export const diagnosticEventSchema = z.object({
  code: idSchema,
  durationMs: z.number().nonnegative().optional(),
  contentHashPrefix: z.string().max(16).optional(),
}).strict();

export const bridgeRequestSchema = z.discriminatedUnion("type", [
  envelope("app.handshake", z.object({
    appVersion: z.string(),
    rendererBuildHash: idSchema,
  }).strict()),
  envelope("file.open", z.object({}).strict()),
  envelope("file.readBytes", z.object({ fileToken: idSchema }).strict()),
  envelope("sidecar.read", z.object({ identity: scoreIdentitySchema }).strict()),
  envelope("sidecar.write", z.object({
    identity: scoreIdentitySchema,
    payload: sidecarPayloadSchema,
  }).strict()),
  envelope("playbackResume.read", z.object({ identity: scoreIdentitySchema }).strict()),
  envelope("playbackResume.write", z.object({
    identity: scoreIdentitySchema,
    resume: localPlaybackResumeSchema,
  }).strict()),
  envelope("app.lifecycleAck", z.object({
    state: z.enum(["suspend", "prepare-close"]),
  }).strict()),
  envelope("diagnostics.write", diagnosticEventSchema),
  envelope("diagnostics.openDirectory", z.object({}).strict()),
]);

export const bridgeEventSchema = z.discriminatedUnion("type", [
  envelope("app.command", z.object({
    command: z.enum(["open-score", "toggle-playback"]),
  }).strict()),
  envelope("app.lifecycle", z.object({
    state: z.enum(["suspend", "prepare-close"]),
  }).strict()),
  envelope("storage.warning", z.object({
    code: z.literal("CORRUPT_PERSISTED_DATA"),
    category: z.enum(["sidecar", "resume"]),
  }).strict()),
]);

export const bridgeResponseSchemas = {
  "app.handshake": z.object({
    appVersion: z.string(),
    bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
    rendererBuildHash: idSchema,
    capabilities: capabilitiesSchema,
  }).strict(),
  "file.open": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z.object({
      status: z.literal("opened"),
      fileToken: idSchema,
      fileName: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
    }).strict(),
  ]),
  "file.readBytes": z.object({
    fileName: z.string().min(1),
    bytes: z.instanceof(Uint8Array),
  }).strict(),
  "sidecar.read": z.object({ payload: sidecarPayloadSchema.optional() }).strict(),
  "sidecar.write": z.object({}).strict(),
  "playbackResume.read": z.object({ resume: localPlaybackResumeSchema.optional() }).strict(),
  "playbackResume.write": z.object({}).strict(),
  "app.lifecycleAck": z.object({}).strict(),
  "diagnostics.write": z.object({}).strict(),
  "diagnostics.openDirectory": z.object({}).strict(),
} as const;

export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type BridgeError = z.infer<typeof bridgeErrorSchema>;
export type BridgeRequestType = BridgeRequest["type"];
export type BridgeResponse<T extends BridgeRequestType> = z.infer<
  (typeof bridgeResponseSchemas)[T]
>;

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

export function parseBridgeResponse<T extends BridgeRequestType>(
  type: T,
  value: unknown,
): BridgeResponse<T> {
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
