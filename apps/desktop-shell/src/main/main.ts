import path from "node:path";
import {
  createBridgeEvent,
  localPlaybackResumeSchema,
  sidecarPayloadSchema,
} from "@tab-viewer/web-core";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, ipcMain, protocol, session, shell } from "electron";
import { dispatchBridgeRequest } from "./bridge";
import { DiagnosticLogger } from "./diagnostics";
import { FileTokenStore } from "./fileTokens";
import { openGpFile, readGpFileBytes } from "./files";
import { registerAppProtocol } from "./protocol";
import { JsonStore } from "./storage";

protocol.registerSchemesAsPrivileged([{
  scheme: "tab-viewer",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
    bypassCSP: false,
  },
}]);

const fileTokens = new FileTokenStore();
let mainWindow: BrowserWindow | undefined;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void window.loadURL("tab-viewer://app/index.html");
  return window;
}

void app.whenReady().then(() => {
  const rendererRoot = path.join(__dirname, "../renderer");
  const userData = app.getPath("userData");
  const logDirectory = path.join(userData, "logs");
  const sendStorageWarning = (category: "sidecar" | "resume") =>
    (code: "CORRUPT_PERSISTED_DATA") => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("tab-viewer:event", createBridgeEvent(
        "storage.warning",
        randomUUID(),
        { code, category },
      ));
    };
  const sidecarStore = new JsonStore(
    userData,
    "sidecars",
    sidecarPayloadSchema,
    sendStorageWarning("sidecar"),
  );
  const resumeStore = new JsonStore(
    userData,
    "resume",
    localPlaybackResumeSchema,
    sendStorageWarning("resume"),
  );
  const diagnostics = new DiagnosticLogger(logDirectory);
  registerAppProtocol(rendererRoot);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  ipcMain.handle("tab-viewer:request", (event, value: unknown) => dispatchBridgeRequest({
    senderUrl: event.senderFrame?.url ?? event.sender.getURL(),
    value,
  }, {
    appVersion: __APP_VERSION__,
    rendererBuildHash: __RENDERER_BUILD_HASH__,
    handlers: {
      "file.open": () => openGpFile(fileTokens),
      "file.readBytes": request => readGpFileBytes(fileTokens, request.payload.fileToken),
      "sidecar.read": async request => ({
        payload: await sidecarStore.read(request.payload.identity.contentHash),
      }),
      "sidecar.write": async request => {
        await sidecarStore.write(request.payload.identity.contentHash, request.payload.payload);
        return {};
      },
      "playbackResume.read": async request => ({
        resume: await resumeStore.read(request.payload.identity.contentHash),
      }),
      "playbackResume.write": async request => {
        await resumeStore.write(request.payload.identity.contentHash, request.payload.resume);
        return {};
      },
      "diagnostics.write": async request => {
        await diagnostics.write(request.payload);
        return {};
      },
      "diagnostics.openDirectory": async () => {
        const error = await shell.openPath(logDirectory);
        if (error) throw new Error("DIAGNOSTICS_OPEN_DIRECTORY_FAILED");
        return {};
      },
    },
  }));
  mainWindow = createMainWindow();
});

app.on("window-all-closed", () => app.quit());
