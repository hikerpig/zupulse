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

    expect(new TextDecoder().decode(result.musicXmlBytes)).toContain("<score-partwise");
    expect(new TextDecoder().decode(result.omrBytes)).toBe("fake-omr");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
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
