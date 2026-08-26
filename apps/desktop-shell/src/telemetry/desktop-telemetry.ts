import {
  createNoopTelemetryPort,
  createPostHogTelemetryPort,
  POSTHOG_US_ORIGIN,
  type TelemetryPort,
} from "@zupulse/web-core";

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
  now,
}: DesktopTelemetryOptions): TelemetryPort {
  if (
    !context.enabled ||
    !context.installationId ||
    !context.applicationSessionId ||
    !projectToken ||
    !isAllowedPostHogHost(apiHost)
  ) {
    return createNoopTelemetryPort();
  }
  return (
    createPostHogTelemetryPort({
      getEnabled: () => context.enabled,
      getInstallationId: () => context.installationId,
      getApplicationSessionId: () => context.applicationSessionId,
      platform: "desktop",
      runtime,
      appVersion,
      buildId,
      releaseChannel,
      effectiveLocale,
      createEventId: randomUuid,
      send: (eventName, properties, timestamp) =>
        postPostHogCapture(fetcher, projectToken, eventName, properties, timestamp),
      ...(now === undefined ? {} : { now }),
    }) ?? createNoopTelemetryPort()
  );
}

function isAllowedPostHogHost(apiHost: string | undefined): boolean {
  try {
    return new URL(apiHost ?? "").origin === POSTHOG_US_ORIGIN;
  } catch {
    return false;
  }
}

function postPostHogCapture(
  fetcher: typeof fetch,
  projectToken: string,
  eventName: string,
  properties: Record<string, unknown>,
  timestamp: string,
): void {
  void fetcher(`${POSTHOG_US_ORIGIN}/capture/`, {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: projectToken, event: eventName, properties, timestamp }),
  }).catch(() => undefined);
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
