import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAudiverisAdapter } from "../engines/audiveris";

const fixture = fileURLToPath(new URL("fixtures/fake-audiveris.mjs", import.meta.url));

describe("Audiveris adapter", () => {
  it("inspects a reproducible engine environment", async () => {
    await chmod(fixture, 0o755);
    const adapter = createAudiverisAdapter({ executable: fixture });

    await expect(adapter.inspectEnvironment()).resolves.toEqual({
      id: "audiveris",
      version: "5.5.3",
      executable: "fake-audiveris.mjs",
      inputKinds: ["pdf", "image"],
      commandTemplate: ["-batch", "-transcribe", "-export", "-save", "-output", "<output-dir>", "<input.pdf>"],
      license: {
        id: "AGPL-3.0-only",
        source: "https://github.com/Audiveris/audiveris/blob/master/LICENSE",
      },
    });
  });

  it("runs batch recognition and returns raw Audiveris artifacts", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "audiveris-adapter-"));
    const inputPath = join(directory, "score.pdf");
    const outputDirectory = join(directory, "raw");
    await writeFile(inputPath, "%PDF-fake");
    const adapter = createAudiverisAdapter({ executable: fixture });

    const result = await adapter.recognize({ inputPath, outputDirectory });

    expect(new TextDecoder().decode(result.normalizationBytes)).toContain("<score-partwise");
    expect(result.nativeArtifacts.map((artifact) => artifact.relativePath)).toEqual([
      "raw-output.mxl",
      "raw-output.omr",
    ]);
    expect(new TextDecoder().decode(result.nativeArtifacts[1]?.bytes)).toBe("fake-omr");
    expect(adapter.normalize(result).parts).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("maps Audiveris oversized-image rejection to a semantic input error", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "audiveris-too-large-"));
    const inputPath = join(directory, "score.pdf");
    await writeFile(inputPath, "%PDF-fake");
    const adapter = createAudiverisAdapter({
      executable: fixture,
      environment: { FAKE_AUDIVERIS_FAILURE: "too-large" },
    });

    await expect(adapter.recognize({ inputPath, outputDirectory: join(directory, "raw") })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "input-image-too-large" },
    });
  });

  it("maps an Audiveris per-step timeout to a semantic reason", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "audiveris-timeout-"));
    const inputPath = join(directory, "score.pdf");
    await writeFile(inputPath, "%PDF-fake");
    const adapter = createAudiverisAdapter({
      executable: fixture,
      environment: { FAKE_AUDIVERIS_FAILURE: "step-timeout" },
    });

    await expect(adapter.recognize({ inputPath, outputDirectory: join(directory, "raw") })).rejects.toMatchObject({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "engine-step-timeout" },
    });
  });

  it("maps a missing executable to ENGINE_UNAVAILABLE", async () => {
    const adapter = createAudiverisAdapter({ executable: "/missing/audiveris" });

    await expect(adapter.inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("propagates cancellation through the shared process runner", async () => {
    await chmod(fixture, 0o755);
    const directory = await mkdtemp(join(tmpdir(), "audiveris-cancel-"));
    const inputPath = join(directory, "score.pdf");
    await writeFile(inputPath, "%PDF-fake");
    const controller = new AbortController();
    const adapter = createAudiverisAdapter({
      executable: fixture,
      environment: { FAKE_AUDIVERIS_DELAY_MS: "10000" },
    });
    const pending = adapter.recognize({
      inputPath,
      outputDirectory: join(directory, "raw"),
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "INTERRUPTED" });
  });
});
