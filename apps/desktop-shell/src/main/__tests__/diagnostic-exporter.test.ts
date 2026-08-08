import { afterEach, describe, expect, it, vi } from "vitest";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DiagnosticExporter } from "../diagnostic-exporter";
import { DiagnosticStore } from "../diagnostic-store";

const gunzipAsync = promisify(gunzip);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-diagnostic-export-"));
  roots.push(root);
  return root;
}

const validEvent = JSON.stringify({
  schemaVersion: 1,
  at: "2026-08-08T00:00:00.000Z",
  appVersion: "0.1.0",
  electronVersion: "43.1.0",
  platform: "darwin",
  arch: "arm64",
  source: "main",
  code: "APP_STARTED",
});

describe("DiagnosticExporter", () => {
  it("exports only revalidated events as standard gzip in old-to-new order", async () => {
    const root = await tempRoot();
    const destination = join(root, "export.jsonl.gz");
    const store = new DiagnosticStore(join(root, "logs"), { maximumBytes: validEvent.length + 2 });
    await store.append(`${validEvent}\n`);
    await store.append(`{"truncated":\n${validEvent.replace("APP_STARTED", "APP_START_FAILED")}\n`);
    const exporter = new DiagnosticExporter(store, {
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: destination }),
      now: () => new Date("2026-08-08T01:02:03.000Z"),
    });

    await expect(
      exporter.export(undefined, { title: "Export", buttonLabel: "Save", filterName: "Compressed JSON Lines" }),
    ).resolves.toEqual({
      status: "saved",
    });
    const exported = String(await gunzipAsync(await readFile(destination)));
    expect(exported.endsWith("\n")).toBe(true);
    expect(
      exported
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).code),
    ).toEqual(["APP_STARTED", "APP_START_FAILED"]);
  });

  it("does not snapshot or write when the user cancels", async () => {
    const root = await tempRoot();
    const store = new DiagnosticStore(join(root, "logs"));
    const snapshot = vi.spyOn(store, "snapshot");
    const write = vi.fn();
    const exporter = new DiagnosticExporter(store, {
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
      writeFile: write,
    });

    await expect(
      exporter.export(undefined, { title: "Export", buttonLabel: "Save", filterName: "Compressed JSON Lines" }),
    ).resolves.toEqual({
      status: "cancelled",
    });
    expect(snapshot).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("returns a stable failure without modifying source logs", async () => {
    const root = await tempRoot();
    const store = new DiagnosticStore(join(root, "logs"));
    await store.append(`${validEvent}\n`);
    const before = await store.snapshot();
    const exporter = new DiagnosticExporter(store, {
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: join(root, "export.jsonl.gz") }),
      writeFile: vi.fn().mockRejectedValue(new Error("secret path")),
    });

    await expect(
      exporter.export(undefined, { title: "Export", buttonLabel: "Save", filterName: "Compressed JSON Lines" }),
    ).resolves.toEqual({
      status: "failed",
      code: "DIAGNOSTIC_EXPORT_FAILED",
    });
    await expect(store.snapshot()).resolves.toBe(before);
  });
});
