import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DiagnosticLogger } from "../diagnostics";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-logs-"));
  roots.push(root);
  return root;
}

describe("DiagnosticLogger", () => {
  it("writes only privacy-safe diagnostic fields", async () => {
    const root = await tempRoot();
    const logger = new DiagnosticLogger(root);
    await logger.write({ code: "SCORE_OPENED", durationMs: 12, contentHashPrefix: "abcdef12" });
    const line = JSON.parse((await readFile(join(root, "desktop.log"), "utf8")).trim());
    expect(line).toMatchObject({ code: "SCORE_OPENED", durationMs: 12, contentHashPrefix: "abcdef12" });
    expect(line.at).toEqual(expect.any(String));

    for (const field of ["path", "fileName", "payload"] as const) {
      await expect(logger.write({ code: "UNSAFE", [field]: "secret" })).rejects.toThrow();
    }
  });

  it("rotates to one previous file", async () => {
    const root = await tempRoot();
    const logger = new DiagnosticLogger(root, 1);
    await logger.write({ code: "FIRST" });
    await logger.write({ code: "SECOND" });
    expect(await readFile(join(root, "desktop.log.1"), "utf8")).toContain("FIRST");
    expect(await readFile(join(root, "desktop.log"), "utf8")).toContain("SECOND");
  });
});
