import { app, protocol } from "electron";
import { startDesktopApp } from "./desktop-app";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "zupulse",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  let focusMainWindow: () => void = () => undefined;
  app.on("second-instance", () => focusMainWindow());
  void app.whenReady().then(async () => {
    const desktopApp = await startDesktopApp();
    focusMainWindow = desktopApp.focusMainWindow;
  });
}

app.on("window-all-closed", () => app.quit());
