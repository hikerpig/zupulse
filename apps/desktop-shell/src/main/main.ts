import path from "node:path";
import { app, BrowserWindow, ipcMain, protocol, session } from "electron";
import { dispatchBridgeRequest } from "./bridge";
import { FileTokenStore } from "./fileTokens";
import { openGpFile, readGpFileBytes } from "./files";
import { registerAppProtocol } from "./protocol";

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
    },
  }));
  createMainWindow();
});

app.on("window-all-closed", () => app.quit());
