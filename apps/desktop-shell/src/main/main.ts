import path from "node:path";
import { createBridgeEvent, localPlaybackResumeSchema, sidecarPayloadSchema } from "@tab-viewer/web-core";
import { randomUUID } from "node:crypto";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  protocol,
  session,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { dispatchBridgeRequest } from "./bridge";
import { DiagnosticLogger } from "./diagnostics";
import { FileTokenStore } from "./fileTokens";
import { openScoreFile, readScoreFileBytes, saveScoreFile, selectScoreFiles } from "./files";
import { registerAppProtocol } from "./protocol";
import { JsonStore } from "./storage";
import { DesktopLifecycleCoordinator } from "./lifecycle";
import { DesktopLibraryStore } from "./library/DesktopLibraryStore";
import { verifySqliteAvailable } from "./library/sqlite";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "tab-viewer",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

const fileTokens = new FileTokenStore();
let mainWindow: BrowserWindow | undefined;
let lifecycle: DesktopLifecycleCoordinator | undefined;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: "#1a1a1a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void window.loadURL("tab-viewer://app/index.html");
  return window;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void app.whenReady().then(startDesktopApp);
}

async function startDesktopApp(): Promise<void> {
  const rendererRoot = path.join(__dirname, "../renderer");
  const userData = app.getPath("userData");
  const logDirectory = path.join(userData, "logs");
  verifySqliteAvailable();
  const library = new DesktopLibraryStore(path.join(userData, "library.sqlite"), path.join(userData, "library"));
  await library.initialize();
  app.once("will-quit", () => library.close());
  const sendStorageWarning = (category: "sidecar" | "resume") => (code: "CORRUPT_PERSISTED_DATA") => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(
      "tab-viewer:event",
      createBridgeEvent("storage.warning", randomUUID(), { code, category }),
    );
  };
  const sidecarStore = new JsonStore(userData, "sidecars", sidecarPayloadSchema, sendStorageWarning("sidecar"));
  const resumeStore = new JsonStore(userData, "resume", localPlaybackResumeSchema, sendStorageWarning("resume"));
  const diagnostics = new DiagnosticLogger(logDirectory);
  const openDiagnosticsDirectory = async () => {
    const error = await shell.openPath(logDirectory);
    if (error) throw new Error("DIAGNOSTICS_OPEN_DIRECTORY_FAILED");
  };
  registerAppProtocol(rendererRoot);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  ipcMain.handle("tab-viewer:request", (event, value: unknown) =>
    dispatchBridgeRequest(
      {
        senderUrl: event.senderFrame?.url ?? event.sender.getURL(),
        value,
      },
      {
        appVersion: __APP_VERSION__,
        rendererBuildHash: __RENDERER_BUILD_HASH__,
        handlers: {
          "file.open": () => openScoreFile(fileTokens),
          "file.select": (request) => selectScoreFiles(fileTokens, request.payload.multiple),
          "file.readBytes": (request) => readScoreFileBytes(fileTokens, request.payload.fileToken),
          "file.save": (request) => saveScoreFile(request.payload),
          "library.list": async () => ({ scores: await library.list() }),
          "library.get": async (request) => ({ score: await library.get(request.payload.id) }),
          "library.find": async (request) => ({ score: await library.findByIdentity(request.payload.scoreIdentity) }),
          "library.add": async (request) => {
            const { parsedTitle, parsedArtist, durationMs, ...draft } = request.payload.draft;
            return library.add({
              ...draft,
              file: { ...draft.file, bytes: new Uint8Array(draft.file.bytes) },
              ...(parsedTitle === undefined ? {} : { parsedTitle }),
              ...(parsedArtist === undefined ? {} : { parsedArtist }),
              ...(durationMs === undefined ? {} : { durationMs }),
            });
          },
          "library.readScore": async (request) => await library.readScore(request.payload.id),
          "library.updateMetadata": async (request) => ({
            score: await library.updateMetadata(request.payload.id, request.payload.patch),
          }),
          "library.setFavorite": async (request) => {
            await library.setFavorite(request.payload.id, request.payload.favorite);
            return {};
          },
          "library.markOpened": async (request) => {
            await library.markOpened(request.payload.id, request.payload.openedAt);
            return {};
          },
          "library.delete": async (request) => {
            await library.delete(request.payload.id);
            await Promise.all([sidecarStore.delete(request.payload.id), resumeStore.delete(request.payload.id)]);
            return {};
          },
          "sidecar.read": async (request) => ({
            payload: await sidecarStore.read(request.payload.libraryScoreId ?? request.payload.identity.contentHash),
          }),
          "sidecar.write": async (request) => {
            const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
            if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId)))
              throw new Error("LIBRARY_SCORE_NOT_FOUND");
            await sidecarStore.write(key, request.payload.payload);
            return {};
          },
          "playbackResume.read": async (request) => ({
            resume: await resumeStore.read(request.payload.libraryScoreId ?? request.payload.identity.contentHash),
          }),
          "playbackResume.write": async (request) => {
            const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
            if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId)))
              throw new Error("LIBRARY_SCORE_NOT_FOUND");
            await resumeStore.write(key, request.payload.resume);
            return {};
          },
          "diagnostics.write": async (request) => {
            await diagnostics.write(request.payload);
            return {};
          },
          "diagnostics.openDirectory": async () => {
            await openDiagnosticsDirectory();
            return {};
          },
          "app.lifecycleAck": (request) => {
            lifecycle?.acknowledge(request.payload.state);
            return {};
          },
        },
      },
    ),
  );
  mainWindow = createMainWindow();
  const sendEvent = (event: ReturnType<typeof createBridgeEvent>) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("tab-viewer:event", event);
  };
  lifecycle = new DesktopLifecycleCoordinator(sendEvent, {
    timeoutMs: 5000,
    onTimeout: (code) => {
      void diagnostics.write({ code }).catch(() => undefined);
    },
  });
  installLifecycle(mainWindow, lifecycle);
  installMenu(sendEvent, openDiagnosticsDirectory);
}

function installLifecycle(window: BrowserWindow, coordinator: DesktopLifecycleCoordinator): void {
  let closeRequested = false;
  window.on("close", (event) => {
    if (closeRequested) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeRequested = true;
    void coordinator.prepareClose().finally(() => {
      fileTokens.clear();
      window.destroy();
      app.quit();
    });
  });
  powerMonitor.on("suspend", () => {
    void coordinator.request("suspend");
  });
  powerMonitor.on("lock-screen", () => {
    void coordinator.request("suspend");
  });
}

function installMenu(
  sendEvent: (event: ReturnType<typeof createBridgeEvent>) => void,
  openDiagnosticsDirectory: () => Promise<void>,
): void {
  const command = (value: "open-score" | "toggle-playback") => () => {
    sendEvent(createBridgeEvent("app.command", randomUUID(), { command: value }));
  };
  const template: MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        { label: "导入曲谱…", accelerator: "CmdOrCtrl+O", click: command("open-score") },
        {
          label: "打开日志目录",
          click: () => {
            void openDiagnosticsDirectory().catch(() => undefined);
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "播放",
      submenu: [{ label: "播放/暂停", accelerator: "Space", click: command("toggle-playback") }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("window-all-closed", () => app.quit());
