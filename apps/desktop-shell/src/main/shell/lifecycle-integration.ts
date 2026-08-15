import type { TelemetryPort } from "@zupulse/web-core";
import { app, powerMonitor, type BrowserWindow } from "electron";
import type { DesktopLifecycleCoordinator } from "./lifecycle";

export function installDesktopLifecycle(options: {
  window: BrowserWindow;
  coordinator: DesktopLifecycleCoordinator;
  telemetry: TelemetryPort;
  clearFileAccess(): void;
}): void {
  let closeRequested = false;
  options.window.on("close", (event) => {
    if (closeRequested) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeRequested = true;
    void options.coordinator.prepareClose().finally(async () => {
      await flushTelemetry(options.telemetry, 300);
      options.clearFileAccess();
      options.window.destroy();
      app.quit();
    });
  });
  powerMonitor.on("suspend", () => {
    void options.coordinator.request("suspend");
  });
  powerMonitor.on("lock-screen", () => {
    void options.coordinator.request("suspend");
  });
}

async function flushTelemetry(telemetry: TelemetryPort, deadlineMs: number): Promise<void> {
  await Promise.race([
    telemetry.flush(deadlineMs),
    new Promise<void>((resolve) => setTimeout(resolve, deadlineMs)),
  ]).catch(() => undefined);
}
