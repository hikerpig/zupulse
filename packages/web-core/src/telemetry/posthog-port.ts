import { sanitizeTelemetryException, TelemetryExceptionBudget } from "./sanitizer";
import { telemetryEnvelopeSchema, telemetryExceptionContextSchema, type TelemetryEvent } from "./schemas";
import { createSafeTelemetryPort, type TelemetryPort } from "./types";

export const POSTHOG_US_ORIGIN = "https://us.i.posthog.com";

const releaseChannels = ["alpha", "beta", "production"] as const;

export type PostHogTelemetryPortInput = {
  getInstallationId: () => string | undefined;
  getApplicationSessionId: () => string | undefined;
  getEnabled: () => boolean;
  platform: "browser" | "desktop";
  runtime: "browser" | "renderer" | "main";
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  effectiveLocale: "zh-CN" | "en-US";
  createEventId: () => string;
  send: (eventName: string, properties: Record<string, unknown>, timestamp: string) => void;
  now?: () => Date;
};

export function createPostHogTelemetryPort(input: PostHogTelemetryPortInput): TelemetryPort | undefined {
  if (!input.appVersion || !input.buildId) return undefined;
  if (!(releaseChannels as readonly string[]).includes(input.releaseChannel)) return undefined;

  const now = input.now ?? (() => new Date());
  const exceptionBudget = new TelemetryExceptionBudget();
  const releaseChannel = input.releaseChannel as (typeof releaseChannels)[number];

  return createSafeTelemetryPort({
    capture: (event: TelemetryEvent) => {
      if (!input.getEnabled()) return;
      const installationId = input.getInstallationId();
      const applicationSessionId = input.getApplicationSessionId();
      if (!installationId || !applicationSessionId) return;
      const envelope = telemetryEnvelopeSchema.safeParse({
        schemaVersion: 1,
        eventId: input.createEventId(),
        installationId,
        applicationSessionId,
        occurredAt: now().toISOString(),
        platform: input.platform,
        runtime: input.runtime,
        appVersion: input.appVersion,
        buildId: input.buildId,
        releaseChannel,
        effectiveLocale: input.effectiveLocale,
        event,
      });
      if (!envelope.success) return;
      const { event: parsedEvent, ...base } = envelope.data;
      const { name: eventName, ...eventProperties } = parsedEvent;
      input.send(
        eventName,
        {
          schema_version: base.schemaVersion,
          event_id: base.eventId,
          distinct_id: base.installationId,
          application_session_id: base.applicationSessionId,
          occurred_at: base.occurredAt,
          platform: base.platform,
          runtime: base.runtime,
          app_version: base.appVersion,
          build_id: base.buildId,
          release_channel: base.releaseChannel,
          effective_locale: base.effectiveLocale,
          ...eventProperties,
          $process_person_profile: false,
          $geoip_disable: true,
        },
        now().toISOString(),
      );
    },
    captureException: (error, context) => {
      if (!input.getEnabled()) return;
      const installationId = input.getInstallationId();
      const applicationSessionId = input.getApplicationSessionId();
      const parsedContext = telemetryExceptionContextSchema.safeParse(context);
      const sanitized = sanitizeTelemetryException(error);
      if (!parsedContext.success || !sanitized || !installationId || !applicationSessionId) return;
      if (!exceptionBudget.allow(applicationSessionId, sanitized.fingerprint)) return;
      input.send(
        "$exception",
        {
          schema_version: 1,
          distinct_id: installationId,
          application_session_id: applicationSessionId,
          platform: input.platform,
          runtime: input.runtime,
          app_version: input.appVersion,
          build_id: input.buildId,
          release_channel: releaseChannel,
          effective_locale: input.effectiveLocale,
          exception_name: sanitized.name,
          exception_message: sanitized.message,
          exception_fingerprint: sanitized.fingerprint,
          ...(sanitized.stack === undefined ? {} : { exception_stack: sanitized.stack }),
          handled: parsedContext.data.handled,
          ...(parsedContext.data.surface === undefined ? {} : { surface: parsedContext.data.surface }),
          ...(parsedContext.data.operation === undefined ? {} : { operation: parsedContext.data.operation }),
          $process_person_profile: false,
          $geoip_disable: true,
        },
        now().toISOString(),
      );
    },
    flush: async () => undefined,
  });
}
