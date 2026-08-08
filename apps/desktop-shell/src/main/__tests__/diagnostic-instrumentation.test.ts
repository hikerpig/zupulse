import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DesktopDiagnostics } from "../diagnostics";
import {
  installAppDiagnosticInstrumentation,
  installWindowDiagnosticInstrumentation,
  recordBridgeFailure,
  recordPersistedDataCorruption,
} from "../diagnostic-instrumentation";
import { BridgeDispatchError } from "../bridge";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createDiagnostics(): Promise<{ diagnostics: DesktopDiagnostics; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-instrumentation-"));
  roots.push(root);
  return {
    root,
    diagnostics: new DesktopDiagnostics({
      directory: root,
      appVersion: "0.1.0",
      electronVersion: "43.1.0",
      platform: "darwin",
      arch: "arm64",
    }),
  };
}

describe("diagnostic instrumentation", () => {
  it("maps Electron and Node app failures without persisting raw errors", async () => {
    const { diagnostics, root } = await createDiagnostics();
    const app = new EventEmitter();
    const processTarget = new EventEmitter();
    const uninstall = installAppDiagnosticInstrumentation(app, diagnostics, processTarget);

    app.emit("child-process-gone", {}, { reason: "crashed", exitCode: 9, name: "/secret/helper" });
    processTarget.emit("uncaughtExceptionMonitor", new Error("secret exception"), "uncaughtException");
    processTarget.emit("unhandledRejection", new Error("secret rejection"), Promise.resolve());
    await diagnostics.recordMain({ code: "APP_STARTED" });
    uninstall();

    const text = await readFile(join(root, "desktop.log"), "utf8");
    expect(text).toContain('"code":"CHILD_PROCESS_GONE"');
    expect(text).toContain('"errorCode":"UNCAUGHT_EXCEPTION"');
    expect(text).toContain('"errorCode":"UNHANDLED_REJECTION"');
    expect(text).not.toContain("secret");
    expect(text).not.toContain("helper");
  });

  it("maps window failures to allowlisted facts", async () => {
    const { diagnostics, root } = await createDiagnostics();
    const window = new EventEmitter() as EventEmitter & { webContents: EventEmitter };
    window.webContents = new EventEmitter();
    const uninstall = installWindowDiagnosticInstrumentation(window, diagnostics);

    window.webContents.emit("did-fail-load", {}, -2, "secret description", "file:///secret/score.gp", true);
    window.webContents.emit("preload-error", {}, "/secret/preload.cjs", new Error("secret preload"));
    window.emit("unresponsive");
    window.webContents.emit("render-process-gone", {}, { reason: "oom", exitCode: 137 });
    await diagnostics.recordMain({ code: "APP_STARTED" });
    uninstall();

    const text = await readFile(join(root, "desktop.log"), "utf8");
    expect(text).toContain('"errorCode":"RENDERER_LOAD_FAILED"');
    expect(text).toContain('"errorCode":"PRELOAD_FAILED"');
    expect(text).toContain('"code":"RENDERER_UNRESPONSIVE"');
    expect(text).toContain('"code":"RENDERER_PROCESS_GONE"');
    expect(text).not.toContain("secret");
    expect(text).not.toContain("file://");
  });

  it("maps Bridge rejection and persisted-data corruption to stable facts", async () => {
    const { diagnostics, root } = await createDiagnostics();

    recordBridgeFailure(
      diagnostics,
      new BridgeDispatchError("INVALID_BRIDGE_MESSAGE", "secret payload /secret/score.gp", false),
    );
    recordPersistedDataCorruption(diagnostics, "sidecar");
    await diagnostics.recordMain({ code: "APP_STARTED" });

    const text = await readFile(join(root, "desktop.log"), "utf8");
    expect(text).toContain('"code":"BRIDGE_MESSAGE_REJECTED"');
    expect(text).toContain('"errorCode":"INVALID_BRIDGE_MESSAGE"');
    expect(text).toContain('"code":"PERSISTED_DATA_CORRUPT"');
    expect(text).toContain('"operation":"sidecar.read"');
    expect(text).not.toContain("secret");
  });
});
