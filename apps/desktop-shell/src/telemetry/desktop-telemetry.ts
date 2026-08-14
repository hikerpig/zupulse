import {
  createNoopTelemetryPort,
  createSafeTelemetryPort,
  telemetryEnvelopeSchema,
  TelemetryExceptionBudget,
  sanitizeTelemetryException,
  telemetryExceptionContextSchema,
  type TelemetryEvent,
  type TelemetryPort,
  type TelemetryExceptionContext,
} from "@zupulse/web-core";

export const POSTHOG_US_ORIGIN = "https://us.i.posthog.com";

export type DesktopTelemetryContext = {
  enabled: boolean;
  installationId?: string;
  applicationSessionId?: string;
};

export type DesktopTelemetryOptions = {
  context: DesktopTelemetryContext;
  runtime: "renderer" | "main";
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  projectToken?: string;
  apiHost?: string;
  effectiveLocale: "zh-CN" | "en-US";
  fetcher?: typeof fetch;
  now?: () => Date;
};

export function createDesktopTelemetryPort({
  context,
  runtime,
  appVersion,
  buildId,
  releaseChannel,
  projectToken,
  apiHost,
  effectiveLocale,
  fetcher = fetch,
  now = () => new Date(),
}: DesktopTelemetryOptions): TelemetryPort {
  if (
    !context.enabled ||
    !context.installationId ||
    !context.applicationSessionId ||
    !projectToken ||
    !["alpha", "beta", "production"].includes(releaseChannel) ||
    !isAllowedHost(apiHost)
  ) {
    return createNoopTelemetryPort();
  }

  const exceptionBudget = new TelemetryExceptionBudget();
  return createSafeTelemetryPort({
    capture: (event: TelemetryEvent) => {
      const envelope = telemetryEnvelopeSchema.safeParse({
        schemaVersion: 1,
        eventId: randomUuid(),
        installationId: context.installationId,
        applicationSessionId: context.applicationSessionId,
        occurredAt: now().toISOString(),
        platform: "desktop",
        runtime,
        appVersion,
        buildId,
        releaseChannel,
        effectiveLocale,
        event,
      });
      if (!envelope.success) return;
      const { event: parsedEvent, ...base } = envelope.data;
      const properties = {
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
        ...parsedEvent,
        $process_person_profile: false,
        $geoip_disable: true,
      };
      void fetcher(`${POSTHOG_US_ORIGIN}/capture/`, {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: projectToken,
          event: parsedEvent.name,
          properties,
          timestamp: now().toISOString(),
        }),
      }).catch(() => undefined);
    },
    captureException: (error, exceptionContext: TelemetryExceptionContext) => {
      const parsedContext = telemetryExceptionContextSchema.safeParse(exceptionContext);
      const sanitized = sanitizeTelemetryException(error);
      if (!parsedContext.success || !sanitized) return;
      if (!exceptionBudget.allow(context.applicationSessionId ?? "unknown", sanitized.fingerprint)) return;
      const properties = {
        schema_version: 1,
        distinct_id: context.installationId,
        application_session_id: context.applicationSessionId,
        platform: "desktop",
        runtime,
        app_version: appVersion,
        build_id: buildId,
        release_channel: releaseChannel,
        effective_locale: effectiveLocale,
        exception_name: sanitized.name,
        exception_message: sanitized.message,
        exception_fingerprint: sanitized.fingerprint,
        ...(sanitized.stack === undefined ? {} : { exception_stack: sanitized.stack }),
        handled: parsedContext.data.handled,
        ...(parsedContext.data.surface === undefined ? {} : { surface: parsedContext.data.surface }),
        ...(parsedContext.data.operation === undefined ? {} : { operation: parsedContext.data.operation }),
        $process_person_profile: false,
        $geoip_disable: true,
      };
      void fetcher(`${POSTHOG_US_ORIGIN}/capture/`, {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: projectToken,
          event: "$exception",
          properties,
          timestamp: now().toISOString(),
        }),
      }).catch(() => undefined);
    },
    flush: async () => undefined,
  });
}

function isAllowedHost(value: string | undefined): boolean {
  try {
    return new URL(value ?? "").origin === POSTHOG_US_ORIGIN;
  } catch {
    return false;
  }
}

function randomUuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16);
      return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
    })
  );
}
