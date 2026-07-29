import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(new URL("../../../../package.json", import.meta.url)));

describe("harmony CLI process", () => {
  it("prints parseable inspect JSON without pnpm banners", async () => {
    const { stdout } = await execFileAsync(
      "pnpm",
      ["-s", "harmony:cli", "inspect", "test-fixtures/musicxml/generated/simple.mxl", "--view", "model"],
      { cwd: root },
    );

    expect(JSON.parse(stdout)).toMatchObject({ schemaVersion: "1.0.0", command: "inspect" });
  });

  it("prints JSON and exits nonzero when a regression differs", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "zupulse-harmony-cli-"));
    try {
      const sourceManifest = resolve(root, "test-fixtures/harmony/regressions/manifest.json");
      const manifest = JSON.parse(await readFile(sourceManifest, "utf8")) as {
        cases: Array<{ score: string; sha256: string }>;
      };
      manifest.cases[0]!.score = relative(
        directory,
        resolve(root, "test-fixtures/musicxml/generated/single-voice.musicxml"),
      );
      manifest.cases[0]!.sha256 = "0".repeat(64);
      const path = resolve(directory, "manifest.json");
      await writeFile(path, JSON.stringify(manifest));

      const failure = await execFileAsync("pnpm", ["-s", "harmony:cli", "eval", path], { cwd: root }).catch(
        (error: unknown) => error as { code: number; stdout: string },
      );

      expect(failure.code).toBe(1);
      expect(JSON.parse(failure.stdout)).toMatchObject({
        command: "eval",
        summary: { passed: 0, failed: 1 },
        cases: [{ status: "failed" }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
