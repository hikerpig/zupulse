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
import { getLocalStorage } from "../local-storage";

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

type SafeTelemetryConfig = BrowserTelemetryConfig & {
  projectToken: string;
  releaseChannel: "alpha" | "beta" | "production";
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

const disabledState = (): TelemetryPreferenceState => ({
  schemaVersion: 1,
  enabled: false,
  noticeAcknowledged: false,
});

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
  const storage = getLocalStorage(ownerDocument);
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

  const activatePostHogSession = (): void => {
    applicationSessionId = randomUuid();
    sessionStarted = false;
    currentPort = isSafeConfig(config)
      ? createSafeTelemetryPort(
          createPostHogPort(
            config,
            () => state,
            () => applicationSessionId,
            fetcher,
            now,
          ),
        )
      : createNoopTelemetryPort();
  };

  if (state.enabled && loaded.valid && isSafeConfig(config)) {
    const installationId = state.installationId ?? randomUuid();
    state = { ...state, installationId };
    if (!writeState(storage, state)) {
      state = disabledState();
    } else {
      activatePostHogSession();
    }
  } else if (!loaded.valid) {
    state = disabledState();
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
    const wasEnabled = state.enabled;
    const next = wasEnabled
      ? { ...state, noticeAcknowledged: true }
      : {
          schemaVersion: 1 as const,
          enabled: true,
          noticeAcknowledged: state.noticeAcknowledged,
          installationId: randomUuid(),
        };
    if (!writeState(storage, next)) throw new Error("TELEMETRY_PREFERENCE_WRITE_FAILED");
    state = next;
    if (wasEnabled) return;
    activatePostHogSession();
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
  config: SafeTelemetryConfig,
  getState: () => TelemetryPreferenceState,
  getSessionId: () => string | undefined,
  fetcher: typeof fetch,
  now: () => Date,
): TelemetryPort {
  const exceptionBudget = new TelemetryExceptionBudget();

  const baseProperties = (installationId: string, applicationSessionId: string) => ({
    schema_version: 1,
    distinct_id: installationId,
    application_session_id: applicationSessionId,
    platform: "browser",
    runtime: "browser",
    app_version: config.appVersion,
    build_id: config.buildId,
    release_channel: config.releaseChannel,
    effective_locale: config.effectiveLocale ?? "zh-CN",
    $process_person_profile: false,
    $geoip_disable: true,
  });

  const sendEvent = (eventName: string, properties: Record<string, unknown>): void => {
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
  };

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
      sendEvent(eventName, {
        ...baseProperties(base.installationId, base.applicationSessionId),
        schema_version: base.schemaVersion,
        event_id: base.eventId,
        occurred_at: base.occurredAt,
        ...eventProperties,
      });
    },
    captureException: (error, context: TelemetryExceptionContext) => {
      const parsedContext = telemetryExceptionContextSchema.safeParse(context);
      const state = getState();
      const sessionId = getSessionId();
      const sanitized = sanitizeTelemetryException(error);
      if (!parsedContext.success || !sanitized || !state.enabled || !state.installationId || !sessionId) return;
      if (!exceptionBudget.allow(sessionId, sanitized.fingerprint)) return;
      sendEvent("$exception", {
        ...baseProperties(state.installationId, sessionId),
        exception_name: sanitized.name,
        exception_message: sanitized.message,
        exception_fingerprint: sanitized.fingerprint,
        ...(sanitized.stack === undefined ? {} : { exception_stack: sanitized.stack }),
        handled: parsedContext.data.handled,
        ...(parsedContext.data.surface === undefined ? {} : { surface: parsedContext.data.surface }),
        ...(parsedContext.data.operation === undefined ? {} : { operation: parsedContext.data.operation }),
      });
    },
    // Nothing to flush: events are sent immediately with keepalive, so they survive page unload.
    flush: async () => undefined,
  };
}

function isSafeConfig(config: BrowserTelemetryConfig): config is SafeTelemetryConfig {
  if (!config.projectToken || !config.appVersion || !config.buildId) return false;
  if (!(["alpha", "beta", "production"] as readonly string[]).includes(config.releaseChannel)) return false;
  try {
    return new URL(config.apiHost ?? "").origin === POSTHOG_US_ORIGIN;
  } catch {
    return false;
  }
}

function readState(storage: Storage | undefined): { state: TelemetryPreferenceState; valid: boolean } {
  if (!storage) return { state: disabledState(), valid: false };
  let raw: string | null;
  try {
    raw = storage.getItem(BROWSER_TELEMETRY_STORAGE_KEY);
  } catch {
    return { state: disabledState(), valid: false };
  }
  if (raw === null) return { state: defaultState(), valid: true };
  try {
    return { state: telemetryPreferenceStateSchema.parse(JSON.parse(raw)), valid: true };
  } catch {
    return { state: disabledState(), valid: false };
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
