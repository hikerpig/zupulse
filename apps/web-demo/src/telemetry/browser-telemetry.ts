import {
  createNoopTelemetryPort,
  createPostHogTelemetryPort,
  POSTHOG_US_ORIGIN,
  telemetryPreferenceStateSchema,
  type TelemetryPort,
  type TelemetryPreferenceState,
} from "@zupulse/web-core";
import type { TelemetryPreferenceSnapshot } from "@zupulse/web-viewer";
import { getLocalStorage } from "../local-storage";

export const BROWSER_TELEMETRY_STORAGE_KEY = "zupulse-telemetry";

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
  acknowledgeNotice(): void;
  setPreference(enabled: boolean): Promise<void>;
  startSession(): void;
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
    currentPort =
      createPostHogTelemetryPort({
        getEnabled: () => state.enabled,
        getInstallationId: () => state.installationId,
        getApplicationSessionId: () => applicationSessionId,
        platform: "browser",
        runtime: "browser",
        appVersion: config.appVersion,
        buildId: config.buildId,
        releaseChannel: config.releaseChannel,
        effectiveLocale: config.effectiveLocale ?? "zh-CN",
        createEventId: randomUuid,
        send: (eventName, properties, timestamp) =>
          postPostHogCapture(fetcher, config.projectToken ?? "", eventName, properties, timestamp),
        now,
      }) ?? createNoopTelemetryPort();
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

  const startSession = (): void => {
    if (sessionStarted || !state.enabled || !applicationSessionId) return;
    sessionStarted = true;
    port.capture({ name: "application_session_started" });
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
    getState: () => state,
    acknowledgeNotice,
    setPreference,
    startSession,
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

function isSafeConfig(config: BrowserTelemetryConfig): boolean {
  if (!config.projectToken || !config.appVersion || !config.buildId) return false;
  if (!(["alpha", "beta", "production"] as readonly string[]).includes(config.releaseChannel)) return false;
  return isAllowedPostHogHost(config.apiHost);
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
