import { randomUUID } from "node:crypto";
import path from "node:path";
import { createBridgeEvent, type TelemetryPort } from "@zupulse/web-core";
import { app, ipcMain, session, shell } from "electron";
import { createDesktopCapabilities, BridgeDispatchError } from "./bridge/dispatcher";
import { installBridgeServer } from "./bridge/server";
import {
  installAppDiagnosticInstrumentation,
  installWindowDiagnosticInstrumentation,
  recordBridgeFailure,
  recordPersistedDataCorruption,
} from "./diagnostics/instrumentation";
import { DesktopDiagnostics } from "./diagnostics/desktop-diagnostics";
import { createFileAccessModule } from "./file-access/module";
import { createLibraryModule } from "./library/library-module";
import { DesktopLifecycleCoordinator } from "./shell/lifecycle";
import { registerAppProtocol } from "./shell/protocol";
import { createRecognitionModule } from "./recognition/module";
import { installDesktopLifecycle } from "./shell/lifecycle-integration";
import { createDesktopLocale } from "./shell/locale";
import { installDesktopMenu } from "./shell/menu";
import { createMainWindow, createMainWindowOwner } from "./shell/window";
import { TelemetryPreferenceStore } from "./telemetry-preference-store";
import { createDesktopTelemetryPort } from "../telemetry/desktop-telemetry";

export async function startDesktopApp() {
  const iconPath = path.join(app.getAppPath(), "resources/app-icon.png");
  const mainWindow = createMainWindowOwner(() =>
    createMainWindow({
      iconPath,
      preloadPath: path.join(__dirname, "../preload/preload.cjs"),
    }),
  );
  const dock = process.platform === "darwin" && !app.isPackaged ? app.dock : undefined;
  if (dock) dock.setIcon(iconPath);
  app.setAppLogsPath();
  const logDirectory = app.getPath("logs");
  const diagnostics = new DesktopDiagnostics({
    directory: logDirectory,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
  });
  await diagnostics.initialize();
  let fileAccess: ReturnType<typeof createFileAccessModule> | undefined;
  let recognitionModule: Awaited<ReturnType<typeof createRecognitionModule>> | undefined;
  let libraryModule: Awaited<ReturnType<typeof createLibraryModule>> | undefined;
  let bridgeServer: ReturnType<typeof installBridgeServer> | undefined;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    bridgeServer?.dispose();
    recognitionModule?.dispose();
    libraryModule?.dispose();
    fileAccess?.dispose();
  };
  try {
    const rendererRoot = path.join(__dirname, "../renderer");
    const userData = app.getPath("userData");
    const telemetryStore = new TelemetryPreferenceStore(userData);
    const telemetryContext = await telemetryStore.load();
    const createMainTelemetry = (context: typeof telemetryContext) =>
      createDesktopTelemetryPort({
        context,
        runtime: "main",
        appVersion: __APP_VERSION__,
        buildId: __RENDERER_BUILD_HASH__,
        releaseChannel: __TELEMETRY_RELEASE_CHANNEL__,
        projectToken: __POSTHOG_PROJECT_TOKEN__,
        apiHost: __POSTHOG_API_HOST__,
        effectiveLocale: "en-US",
      });
    let currentMainTelemetry = createMainTelemetry(telemetryContext);
    const mainTelemetry: TelemetryPort = {
      capture: (event) => currentMainTelemetry.capture(event),
      captureException: (error, context) => currentMainTelemetry.captureException(error, context),
      flush: (deadlineMs) => currentMainTelemetry.flush(deadlineMs),
    };
    installAppDiagnosticInstrumentation(app, diagnostics, process, mainTelemetry);
    const recordFailure = (error: unknown): void => {
      recordBridgeFailure(diagnostics, error);
      mainTelemetry.captureException(error, { runtime: "main", handled: true, operation: "bridge.dispatch" });
    };
    const locale = await createDesktopLocale({
      userData,
      getSystemLanguages: () => app.getPreferredSystemLanguages(),
    });
    fileAccess = createFileAccessModule({
      getLocale: locale.getEffectiveLocale,
      recordFailure,
    });
    const sendEvent = mainWindow.sendEvent;
    recognitionModule = await createRecognitionModule({
      userData,
      homeDirectory: app.getPath("home"),
      platform: process.platform,
      fileTokens: fileAccess.fileTokens,
      getLocale: locale.getEffectiveLocale,
      sendEvent,
      diagnostics,
    });
    libraryModule = await createLibraryModule({
      userData,
      onStorageWarning: (category, code) => {
        recordPersistedDataCorruption(diagnostics, category);
        sendEvent(createBridgeEvent("storage.warning", randomUUID(), { code, category }));
      },
    });
    const openDiagnosticsDirectory = async () => {
      const error = await shell.openPath(logDirectory);
      if (error) throw new Error("DIAGNOSTICS_OPEN_DIRECTORY_FAILED");
    };
    registerAppProtocol(rendererRoot);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    let lifecycle: DesktopLifecycleCoordinator | undefined;
    const refreshMenu = () =>
      installDesktopMenu({
        sendEvent,
        diagnostics,
        openDiagnosticsDirectory,
        getWindow: mainWindow.get,
        locale: locale.getEffectiveLocale(),
      });
    fileAccess.installDroppedFileIpc(ipcMain);
    bridgeServer = installBridgeServer({
      ipc: ipcMain,
      appVersion: __APP_VERSION__,
      rendererBuildHash: __RENDERER_BUILD_HASH__,
      capabilities: createDesktopCapabilities(recognitionModule.pdfOmrEngines),
      getLocale: locale.getState,
      telemetryAvailable:
        ["alpha", "beta", "production"].includes(__TELEMETRY_RELEASE_CHANNEL__) &&
        Boolean(__POSTHOG_PROJECT_TOKEN__) &&
        __POSTHOG_API_HOST__ === "https://us.i.posthog.com",
      getTelemetry: telemetryStore.getHandshake.bind(telemetryStore),
      handlers: {
        "external.openUrl": async (request) => {
          await shell.openExternal(request.payload.url);
          return {};
        },
        "app.locale.setPreference": async (request) => {
          try {
            const next = await locale.setPreference(request.payload.preference);
            refreshMenu();
            return next;
          } catch {
            throw new BridgeDispatchError(
              "LOCALE_PREFERENCE_WRITE_FAILED",
              "Locale preference could not be persisted",
              true,
            );
          }
        },
        "app.lifecycleAck": (request) => {
          lifecycle?.acknowledge(request.payload.state);
          return {};
        },
        "app.telemetry.setPreference": async (request) => {
          try {
            const next = await telemetryStore.setPreference(request.payload.enabled);
            currentMainTelemetry = createMainTelemetry(next);
            return next;
          } catch {
            throw new BridgeDispatchError(
              "TELEMETRY_PREFERENCE_WRITE_FAILED",
              "Telemetry preference could not be persisted",
              true,
            );
          }
        },
        ...fileAccess.handlers,
        ...libraryModule.handlers,
        ...recognitionModule.handlers,
        "diagnostics.write": async (request) => {
          await diagnostics.recordRenderer(request.payload);
          return {};
        },
      },
      recordFailure,
    });
    app.once("will-quit", dispose);
    const window = mainWindow.create();
    installWindowDiagnosticInstrumentation(window, diagnostics, mainTelemetry);
    lifecycle = new DesktopLifecycleCoordinator(sendEvent, {
      timeoutMs: 5000,
      onTimeout: (code) => void diagnostics.recordMain({ code }),
    });
    installDesktopLifecycle({
      window,
      coordinator: lifecycle,
      telemetry: mainTelemetry,
      clearFileAccess: fileAccess.dispose,
    });
    refreshMenu();
    void diagnostics.recordMain({ code: "APP_STARTED" });
    return { focusMainWindow: mainWindow.focus };
  } catch (error) {
    dispose();
    await diagnostics.recordMain({ code: "APP_START_FAILED" });
    app.quit();
    throw error;
  }
}
