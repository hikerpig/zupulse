import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DesktopDiagnostics, persistedHostDiagnosticEventSchema } from "../diagnostics";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-logs-"));
  roots.push(root);
  return root;
}

describe("DesktopDiagnostics", () => {
  it("adds trusted host facts and writes a strictly validated event", async () => {
    const root = await tempRoot();
    const diagnostics = new DesktopDiagnostics({
      directory: root,
      appVersion: "0.1.0",
      electronVersion: "43.1.0",
      platform: "darwin",
      arch: "arm64",
      now: () => new Date("2026-08-08T00:00:00.000Z"),
    });

    await diagnostics.recordRenderer({
      code: "HOST_OPERATION_FAILED",
      operation: "library.open",
      errorCode: "VIEWER_OPEN_FAILED",
    });

    const event = JSON.parse((await readFile(join(root, "desktop.log"), "utf8")).trim());
    expect(persistedHostDiagnosticEventSchema.parse(event)).toEqual({
      schemaVersion: 1,
      at: "2026-08-08T00:00:00.000Z",
      appVersion: "0.1.0",
      electronVersion: "43.1.0",
      platform: "darwin",
      arch: "arm64",
      source: "renderer",
      code: "HOST_OPERATION_FAILED",
      operation: "library.open",
      errorCode: "VIEWER_OPEN_FAILED",
    });
  });

  it("drops invalid input and filesystem failures without rejecting business calls", async () => {
    const root = await tempRoot();
    const blocked = join(root, "blocked");
    await writeFile(blocked, "not a directory");
    const diagnostics = new DesktopDiagnostics({
      directory: blocked,
      appVersion: "0.1.0",
      electronVersion: "43.1.0",
      platform: "darwin",
      arch: "arm64",
    });

    await expect(diagnostics.initialize()).resolves.toBeUndefined();
    await expect(diagnostics.recordRenderer({ code: "UNSAFE", path: "/secret" })).resolves.toBeUndefined();
    await expect(diagnostics.recordMain({ code: "APP_STARTED" })).resolves.toBeUndefined();
  });
});
