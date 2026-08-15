import type { BridgeEvent } from "@zupulse/web-core";
import { BrowserWindow } from "electron";

export function createMainWindow(options: { iconPath: string; preloadPath: string }): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: "#1a1a1a",
    icon: options.iconPath,
    webPreferences: {
      preload: options.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void window.loadURL("zupulse://app/index.html");
  return window;
}

export function createMainWindowOwner(createWindow: () => BrowserWindow) {
  let window: BrowserWindow | undefined;
  return {
    create(): BrowserWindow {
      window = createWindow();
      return window;
    },
    get(): BrowserWindow | undefined {
      return window && !window.isDestroyed() ? window : undefined;
    },
    focus(): void {
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
    sendEvent(event: BridgeEvent): void {
      if (!window || window.isDestroyed()) return;
      window.webContents.send("zupulse:event", event);
    },
  };
}
