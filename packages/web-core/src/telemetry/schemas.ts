import { z } from "zod";

const uuidSchema = z.uuid();
const issueCodeSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const scoreFormatSchema = z.enum(["gp", "musicxml"]);
const releaseChannelSchema = z.enum(["alpha", "beta", "production"]);
const platformSchema = z.enum(["browser", "desktop"]);
const runtimeSchema = z.enum(["browser", "renderer", "main"]);

const telemetryEventBase = z.object({}).strict();
export const TELEMETRY_DURATION_MS_MAX = 120_000;
const durationMsSchema = z.number().int().nonnegative().max(TELEMETRY_DURATION_MS_MAX);

export function telemetryDurationMs(startedAt: number, endedAt: number): number | undefined {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return undefined;
  const durationMs = Math.round(endedAt - startedAt);
  if (durationMs < 0 || durationMs > TELEMETRY_DURATION_MS_MAX) return undefined;
  return durationMs;
}

const applicationSessionStartedSchema = telemetryEventBase.extend({
  name: z.literal("application_session_started"),
});

const applicationReadySchema = telemetryEventBase.extend({
  name: z.literal("application_ready"),
  initialSurface: z.enum(["library", "viewer", "studio", "not-found"]),
  state: z.enum(["ready", "degraded"]),
  durationMs: durationMsSchema.optional(),
});

const scoreImportCompletedSchema = telemetryEventBase.extend({
  name: z.literal("score_import_completed"),
  source: z.enum(["picker", "drop", "sample"]),
  outcome: z.enum(["created", "existing", "failed"]),
  scoreFormat: scoreFormatSchema.optional(),
  issueCode: issueCodeSchema.optional(),
});

const workspaceSessionStartedSchema = telemetryEventBase.extend({
  name: z.literal("workspace_session_started"),
  workspace: z.enum(["viewer", "studio"]),
  scoreFormat: scoreFormatSchema,
  durationMs: durationMsSchema.optional(),
});

const viewerPlaybackStartedSchema = telemetryEventBase.extend({
  name: z.literal("viewer_playback_started"),
  scoreFormat: scoreFormatSchema,
  navigationMode: z.enum(["continuous-follow", "page-turn"]),
});

const applicationIssuePresentedSchema = telemetryEventBase.extend({
  name: z.literal("application_issue_presented"),
  surface: z.enum(["startup", "library", "viewer", "studio", "settings"]),
  issueCode: issueCodeSchema,
  recoverable: z.boolean(),
});

const runtimeFailureObservedSchema = telemetryEventBase.extend({
  name: z.literal("runtime_failure_observed"),
  runtime: z.literal("renderer"),
  reason: z.enum(["crashed", "oom", "killed", "integrity-failure", "unknown"]),
});

export const telemetryEventSchema = z.discriminatedUnion("name", [
  applicationSessionStartedSchema,
  applicationReadySchema,
  scoreImportCompletedSchema,
  workspaceSessionStartedSchema,
  viewerPlaybackStartedSchema,
  applicationIssuePresentedSchema,
  runtimeFailureObservedSchema,
]);

export const telemetryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: uuidSchema,
    installationId: uuidSchema,
    applicationSessionId: uuidSchema,
    occurredAt: z.iso.datetime(),
    platform: platformSchema,
    runtime: runtimeSchema,
    appVersion: z.string().min(1).max(128),
    buildId: z.string().min(1).max(128),
    releaseChannel: releaseChannelSchema,
    effectiveLocale: z.enum(["zh-CN", "en-US"]),
    event: telemetryEventSchema,
  })
  .strict();

export const telemetryPreferenceStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    noticeAcknowledged: z.boolean(),
    installationId: uuidSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled && value.installationId) {
      context.addIssue({
        code: "custom",
        path: ["installationId"],
        message: "disabled telemetry cannot retain identity",
      });
    }
  });

export const telemetryExceptionContextSchema = z
  .object({
    runtime: runtimeSchema,
    handled: z.boolean(),
    surface: z.enum(["startup", "library", "viewer", "studio", "settings"]).optional(),
    operation: z
      .string()
      .regex(/^[a-z][a-z0-9_.-]{0,63}$/)
      .optional(),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type TelemetryEnvelope = z.infer<typeof telemetryEnvelopeSchema>;
export type TelemetryPreferenceState = z.infer<typeof telemetryPreferenceStateSchema>;
export type TelemetryExceptionContext = z.infer<typeof telemetryExceptionContextSchema>;
