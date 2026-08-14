import {
  createNoopTelemetryPort,
  createSafeTelemetryPort,
  telemetryEnvelopeSchema,
  telemetryPreferenceStateSchema,
  TelemetryExceptionBudget,
  sanitizeTelemetryException,
  telemetryExceptionContextSchema,
  type TelemetryEvent,
  type TelemetryPort,
  type TelemetryPreferenceState,
  type TelemetryExceptionContext,
} from "@zupulse/web-core";
import type { TelemetryPreferenceSnapshot } from "@zupulse/web-viewer";

export const BROWSER_TELEMETRY_STORAGE_KEY = "zupulse-telemetry";
export const POSTHOG_US_ORIGIN = "https://us.i.posthog.com";

type BrowserTelemetryConfig = {
  appVersion: string;
  buildId: string;
  releaseChannel: string;
  projectToken?: string;
  apiHost?: string;
  effectiveLocale?: "zh-CN" | "en-US";
};

type BrowserTelemetryOptions = {
  ownerDocument: Document;
  config: BrowserTelemetryConfig;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type BrowserTelemetry = {
  port: TelemetryPort;
  getState(): TelemetryPreferenceState;
  getApplicationSessionId(): string | undefined;
  acknowledgeNotice(): void;
  setPreference(enabled: boolean): Promise<void>;
  startSession(): void;
  capture(event: TelemetryEvent): void;
  getControl(): {
    getState(): TelemetryPreferenceSnapshot;
    acknowledgeNotice(): void;
    setPreference(enabled: boolean): Promise<void>;
  };
};

const defaultState = (): TelemetryPreferenceState => ({
  schemaVersion: 1,
  enabled: true,
  noticeAcknowledged: false,
});

export function createBrowserTelemetry({
  ownerDocument,
  config,
  fetcher = fetch,
  now = () => new Date(),
}: BrowserTelemetryOptions): BrowserTelemetry {
  const storage = getStorage(ownerDocument);
  const loaded = readState(storage);
  let state = loaded.state;
  let applicationSessionId: string | undefined;
  let sessionStarted = false;
  let currentPort: TelemetryPort = createNoopTelemetryPort();
  const port: TelemetryPort = {
    capture: (event) => currentPort.capture(event),
    captureException: (error, context) => currentPort.captureException(error, context),
    flush: (deadlineMs) => currentPort.flush(deadlineMs),
  };

  if (state.enabled && loaded.valid && isSafeConfig(config)) {
    const installationId = state.installationId ?? randomUuid();
    state = { ...state, installationId };
    if (!writeState(storage, state)) {
      state = { schemaVersion: 1, enabled: false, noticeAcknowledged: false };
    } else {
      applicationSessionId = randomUuid();
      currentPort = createSafeTelemetryPort(
        createPostHogPort(
          { ...config, releaseChannel: config.releaseChannel as "alpha" | "beta" | "production" },
          () => state,
          () => applicationSessionId,
          fetcher,
          now,
        ),
      );
    }
  } else if (!loaded.valid) {
    state = { schemaVersion: 1, enabled: false, noticeAcknowledged: false };
  }

  const getState = () => state;

  const capture = (event: TelemetryEvent): void => {
    if (state.enabled && applicationSessionId && state.installationId) currentPort.capture(event);
  };

  const startSession = (): void => {
    if (sessionStarted || !state.enabled || !applicationSessionId) return;
    sessionStarted = true;
    capture({ name: "application_session_started" });
  };

  const acknowledgeNotice = (): void => {
    if (state.noticeAcknowledged) return;
    const next = { ...state, noticeAcknowledged: true };
    if (writeState(storage, next)) state = next;
  };

  const setPreference = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      const next = { schemaVersion: 1 as const, enabled: false, noticeAcknowledged: true };
      if (!writeState(storage, next)) throw new Error("TELEMETRY_PREFERENCE_WRITE_FAILED");
      state = next;
      applicationSessionId = undefined;
      sessionStarted = false;
      currentPort = createNoopTelemetryPort();
      return;
    }
    const next = state.enabled
      ? { ...state, noticeAcknowledged: true }
      : {
          schemaVersion: 1 as const,
          enabled: true,
          noticeAcknowledged: state.noticeAcknowledged,
          installationId: randomUuid(),
        };
    if (state.enabled) {
      if (!writeState(storage, next)) throw new Error("TELEMETRY_PREFERENCE_WRITE_FAILED");
      state = next;
      return;
    }
    if (!writeState(storage, next)) throw new Error("TELEMETRY_PREFERENCE_WRITE_FAILED");
    state = next;
    applicationSessionId = randomUuid();
    sessionStarted = false;
    currentPort = isSafeConfig(config)
      ? createSafeTelemetryPort(
          createPostHogPort(
            { ...config, releaseChannel: config.releaseChannel as "alpha" | "beta" | "production" },
            () => state,
            () => applicationSessionId,
            fetcher,
            now,
          ),
        )
      : createNoopTelemetryPort();
    startSession();
  };

  return {
    port,
    getState,
    getApplicationSessionId: () => applicationSessionId,
    acknowledgeNotice,
    setPreference,
    startSession,
    capture,
    getControl: () => ({
      getState: () => ({
        available: isSafeConfig(config),
        enabled: state.enabled,
        noticeAcknowledged: state.noticeAcknowledged,
      }),
      acknowledgeNotice,
      setPreference,
    }),
  };
}

function createPostHogPort(
  config: Required<Pick<BrowserTelemetryConfig, "appVersion" | "buildId" | "releaseChannel" | "projectToken">> &
    Pick<BrowserTelemetryConfig, "effectiveLocale">,
  getState: () => TelemetryPreferenceState,
  getSessionId: () => string | undefined,
  fetcher: typeof fetch,
  now: () => Date,
): TelemetryPort {
  const exceptionBudget = new TelemetryExceptionBudget();
  return {
    capture: (event) => {
      const state = getState();
      const applicationSessionId = getSessionId();
      if (!state.enabled || !state.installationId || !applicationSessionId) return;
      const envelope = telemetryEnvelopeSchema.safeParse({
        schemaVersion: 1,
        eventId: randomUuid(),
        installationId: state.installationId,
        applicationSessionId,
        occurredAt: now().toISOString(),
        platform: "browser",
        runtime: "browser",
        appVersion: config.appVersion,
        buildId: config.buildId,
        releaseChannel: config.releaseChannel,
        effectiveLocale: config.effectiveLocale ?? "zh-CN",
        event,
      });
      if (!envelope.success) return;
      const { event: parsedEvent, ...base } = envelope.data;
      const { name: eventName, ...eventProperties } = parsedEvent;
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
        ...eventProperties,
        $process_person_profile: false,
        $geoip_disable: true,
      };
      void fetcher(`${POSTHOG_US_ORIGIN}/capture/`, {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: config.projectToken,
          event: eventName,
          properties,
          timestamp: now().toISOString(),
        }),
      }).catch(() => undefined);
    },
    captureException: (error, context: TelemetryExceptionContext) => {
      const parsedContext = telemetryExceptionContextSchema.safeParse(context);
      const state = getState();
      const sessionId = getSessionId();
      const sanitized = sanitizeTelemetryException(error);
      if (!parsedContext.success || !sanitized || !state.enabled || !state.installationId || !sessionId) return;
      if (!exceptionBudget.allow(sessionId, sanitized.fingerprint)) return;
      const properties = {
        schema_version: 1,
        distinct_id: state.installationId,
        application_session_id: sessionId,
        platform: "browser",
        runtime: "browser",
        app_version: config.appVersion,
        build_id: config.buildId,
        release_channel: config.releaseChannel,
        effective_locale: config.effectiveLocale ?? "zh-CN",
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
          api_key: config.projectToken,
          event: "$exception",
          properties,
          timestamp: now().toISOString(),
        }),
      }).catch(() => undefined);
    },
    flush: async () => undefined,
  };
}

function isSafeConfig(config: BrowserTelemetryConfig): config is BrowserTelemetryConfig & {
  projectToken: string;
  releaseChannel: "alpha" | "beta" | "production";
} {
  if (!config.projectToken || !config.appVersion || !config.buildId) return false;
  if (!(["alpha", "beta", "production"] as readonly string[]).includes(config.releaseChannel)) return false;
  try {
    return new URL(config.apiHost ?? "").origin === POSTHOG_US_ORIGIN;
  } catch {
    return false;
  }
}

function getStorage(ownerDocument: Document): Storage | undefined {
  try {
    return ownerDocument.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

function readState(storage: Storage | undefined): { state: TelemetryPreferenceState; valid: boolean } {
  if (!storage) return { state: { schemaVersion: 1, enabled: false, noticeAcknowledged: false }, valid: false };
  let raw: string | null;
  try {
    raw = storage.getItem(BROWSER_TELEMETRY_STORAGE_KEY);
  } catch {
    return { state: { schemaVersion: 1, enabled: false, noticeAcknowledged: false }, valid: false };
  }
  if (raw === null) return { state: defaultState(), valid: true };
  try {
    return { state: telemetryPreferenceStateSchema.parse(JSON.parse(raw)), valid: true };
  } catch {
    return { state: { schemaVersion: 1, enabled: false, noticeAcknowledged: false }, valid: false };
  }
}

function writeState(storage: Storage | undefined, state: TelemetryPreferenceState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BROWSER_TELEMETRY_STORAGE_KEY, JSON.stringify(telemetryPreferenceStateSchema.parse(state)));
    return true;
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
