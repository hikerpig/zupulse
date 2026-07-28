import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTranscodaAdapter } from "../engines/transcoda";

const fixture = fileURLToPath(new URL("fixtures/fake-transcoda.mjs", import.meta.url));
const revision = "d4e2e687d5679ae96ca4aa6f01e06a5b338cd488";

describe("Transcoda adapter", () => {
  it("verifies the repository revision and checkpoint hash", async () => {
    const context = await createContext();
    const adapter = createAdapter(context);

    await expect(adapter.inspectEnvironment()).resolves.toMatchObject({
      id: "transcoda",
      version: revision,
      modelSha256: context.checkpointSha256,
      parameters: {
        grammarConstrained: true,
        layoutNormalization: true,
        maxLength: 512,
        rasterDpi: 150,
        repetitionPenalty: 1.1,
      },
    });
  });

  it("runs rasterize, inference and kern conversion through the shared runner", async () => {
    const context = await createContext();
    const adapter = createAdapter(context);
    const outputDirectory = join(context.directory, "output");

    const raw = await adapter.recognize({
      inputPath: join(context.directory, "score.pdf"),
      outputDirectory,
    });

    expect(raw.nativeArtifacts.map((artifact) => artifact.relativePath)).toEqual([
      "raw-output.krn",
      "converted.musicxml",
    ]);
    expect(new TextDecoder().decode(raw.normalizationBytes)).toContain("<score-partwise");
    expect(raw.diagnostics).toContainEqual(expect.objectContaining({ code: "TRANSCODA_APPENDED_TERMINATOR" }));
    await expect(readFile(join(outputDirectory, "page-1.png"))).resolves.toBeDefined();
  });

  it("rejects a checkpoint whose bytes do not match the locked hash", async () => {
    const context = await createContext();
    const adapter = createTranscodaAdapter({
      ...adapterOptions(context),
      checkpointSha256: "0".repeat(64),
    });

    await expect(adapter.inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason: "checkpoint-hash-mismatch" },
    });
  });

  it.each([
    ["multi-page input", { FAKE_TRANSCODA_PAGES: "2" }, "unsupported-page-count"],
    ["invalid native syntax", { FAKE_TRANSCODA_INVALID_KERN: "1" }, "inconsistent-spine-count"],
  ])("returns a stable failure for %s", async (_label, environment, reason) => {
    const context = await createContext();
    const adapter = createTranscodaAdapter({
      ...adapterOptions(context),
      environment,
    });

    await expect(
      adapter.recognize({
        inputPath: join(context.directory, "score.pdf"),
        outputDirectory: join(context.directory, "failed-output"),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason },
    });
  });
});

async function createContext() {
  await chmod(fixture, 0o755);
  const directory = await mkdtemp(join(tmpdir(), "transcoda-adapter-"));
  const checkpointPath = join(directory, "model.ckpt");
  const checkpoint = new TextEncoder().encode("locked-model");
  await Promise.all([writeFile(checkpointPath, checkpoint), writeFile(join(directory, "score.pdf"), "%PDF-fake")]);
  return {
    directory,
    checkpointPath,
    checkpointSha256: createHash("sha256").update(checkpoint).digest("hex"),
  };
}

function adapterOptions(context: Awaited<ReturnType<typeof createContext>>) {
  return {
    pythonExecutable: fixture,
    gitExecutable: fixture,
    pdftoppmExecutable: fixture,
    hum2xmlExecutable: fixture,
    repositoryPath: context.directory,
    checkpointPath: context.checkpointPath,
    checkpointSha256: context.checkpointSha256,
    repositoryRevision: revision,
  };
}

function createAdapter(context: Awaited<ReturnType<typeof createContext>>) {
  return createTranscodaAdapter(adapterOptions(context));
}
