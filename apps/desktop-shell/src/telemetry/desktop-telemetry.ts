import { createNoopTelemetryPort, createPostHogTelemetryPort, type TelemetryPort } from "@zupulse/web-core";

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
  fetcher,
  now,
}: DesktopTelemetryOptions): TelemetryPort {
  if (!context.enabled || !context.installationId || !context.applicationSessionId) {
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
      ...(projectToken === undefined ? {} : { projectToken }),
      ...(apiHost === undefined ? {} : { apiHost }),
      ...(fetcher === undefined ? {} : { fetcher }),
      ...(now === undefined ? {} : { now }),
    }) ?? createNoopTelemetryPort()
  );
}
