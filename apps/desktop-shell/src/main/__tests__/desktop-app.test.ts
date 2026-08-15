import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disposeFileAccess: vi.fn(),
  disposeLibrary: vi.fn(),
  disposeRecognition: vi.fn(),
  recordMain: vi.fn(async () => undefined),
  quit: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "/app",
    getPath: (name: string) => `/${name}`,
    getPreferredSystemLanguages: () => ["en-US"],
    getVersion: () => "0.1.0",
    isPackaged: true,
    once: vi.fn(),
    quit: mocks.quit,
    setAppLogsPath: vi.fn(),
  },
  ipcMain: {},
  session: { defaultSession: { setPermissionRequestHandler: vi.fn() } },
  shell: { openExternal: vi.fn(), openPath: vi.fn(async () => "") },
}));
vi.mock("../diagnostics/desktop-diagnostics", () => ({
  DesktopDiagnostics: class {
    initialize = vi.fn(async () => undefined);
    recordMain = mocks.recordMain;
  },
}));
vi.mock("../diagnostics/instrumentation", () => ({
  installAppDiagnosticInstrumentation: vi.fn(),
  installWindowDiagnosticInstrumentation: vi.fn(),
  recordBridgeFailure: vi.fn(),
  recordPersistedDataCorruption: vi.fn(),
}));
vi.mock("../file-access/module", () => ({
  createFileAccessModule: () => ({
    dispose: mocks.disposeFileAccess,
    fileTokens: {},
    handlers: {},
    installDroppedFileIpc: vi.fn(),
  }),
}));
vi.mock("../recognition/module", () => ({
  createRecognitionModule: async () => ({
    dispose: mocks.disposeRecognition,
    handlers: {},
    pdfOmrEngines: [],
  }),
}));
vi.mock("../library/library-module", () => ({
  createLibraryModule: async () => ({ dispose: mocks.disposeLibrary, handlers: {} }),
}));
vi.mock("../bridge/server", () => ({
  installBridgeServer: () => {
    throw new Error("bridge failed");
  },
}));
vi.mock("../shell/locale", () => ({
  createDesktopLocale: async () => ({
    getEffectiveLocale: () => "en-US",
    getState: () => ({ preference: "en-US", effectiveLocale: "en-US" }),
    setPreference: vi.fn(),
  }),
}));
vi.mock("../shell/window", () => ({
  createMainWindow: vi.fn(),
  createMainWindowOwner: () => ({ get: vi.fn(), sendEvent: vi.fn() }),
}));
vi.mock("../shell/protocol", () => ({ registerAppProtocol: vi.fn() }));
vi.mock("../telemetry-preference-store", () => ({
  TelemetryPreferenceStore: class {
    load = vi.fn(async () => ({ schemaVersion: 1, enabled: false, noticeAcknowledged: false }));
    getHandshake = vi.fn(() => ({ schemaVersion: 1, enabled: false, noticeAcknowledged: false }));
    setPreference = vi.fn();
  },
}));
vi.mock("../../telemetry/desktop-telemetry", () => ({
  createDesktopTelemetryPort: () => ({ capture: vi.fn(), captureException: vi.fn(), flush: vi.fn() }),
}));

describe("startDesktopApp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disposes initialized feature modules when startup fails", async () => {
    vi.stubGlobal("__APP_VERSION__", "0.1.0");
    vi.stubGlobal("__RENDERER_BUILD_HASH__", "b".repeat(64));
    vi.stubGlobal("__TELEMETRY_RELEASE_CHANNEL__", "development");
    vi.stubGlobal("__POSTHOG_PROJECT_TOKEN__", "");
    vi.stubGlobal("__POSTHOG_API_HOST__", "");
    const { startDesktopApp } = await import("../desktop-app");

    await expect(startDesktopApp()).rejects.toThrow("bridge failed");

    expect(mocks.disposeRecognition).toHaveBeenCalledOnce();
    expect(mocks.disposeLibrary).toHaveBeenCalledOnce();
    expect(mocks.disposeFileAccess).toHaveBeenCalledOnce();
    expect(mocks.quit).toHaveBeenCalledOnce();
  });
});
