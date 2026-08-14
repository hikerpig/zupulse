import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createLegatoAdapter } from "../engines/legato";

const fixture = fileURLToPath(new URL("fixtures/fake-legato.mjs", import.meta.url));
const runner = fileURLToPath(new URL("../../engines/legato-runner.py", import.meta.url));
const revision = "8c1de27e414f487fe59086547aaae23b868ed6ca";

describe("LEGATO adapter", () => {
  it("loads configured checkpoint dtypes and uses float16 on GPU", async () => {
    const source = await readFile(runner, "utf8");

    expect(source).toContain('torch_dtype="auto"');
    expect(source).toContain('if device in {"cuda", "mps"}:');
  });

  it("verifies the repository revision and model hash", async () => {
    const context = await createContext();
    const adapter = createAdapter(context);

    await expect(adapter.inspectEnvironment()).resolves.toMatchObject({
      id: "legato",
      version: revision,
      modelSha256: context.modelSha256,
      parameters: {
        inferenceTimeoutMs: 3_600_000,
        maxLength: 2048,
        maxPdfPages: 3,
        numBeams: 10,
        repetitionPenalty: 1.1,
      },
    });
  });

  it("returns ABC and converted MusicXML artifacts", async () => {
    const context = await createContext();
    const outputDirectory = join(context.directory, "output");
    const raw = await createAdapter(context).recognize({
      inputPath: join(context.directory, "score.pdf"),
      outputDirectory,
    });

    expect(raw.nativeArtifacts.map((artifact) => artifact.relativePath)).toEqual([
      "raw-output.abc",
      "converted.musicxml",
      "pages/page-001.abc",
      "pages/page-001.musicxml",
    ]);
    expect(new TextDecoder().decode(raw.nativeArtifacts[0]?.bytes)).toContain("X:1");
    expect(new TextDecoder().decode(raw.normalizationBytes)).toContain("<score-partwise");
    expect(createAdapter(context).normalize(raw).parts).toHaveLength(1);
    await expect(readFile(join(outputDirectory, "raw-output.abc"), "utf8")).resolves.toContain("Fixture");
  });

  it("recognizes multiple pages independently and preserves page evidence", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      environment: { FAKE_LEGATO_PAGES: "2" },
    });
    const raw = await adapter.recognize({
      inputPath: join(context.directory, "score.pdf"),
      outputDirectory: join(context.directory, "two-pages"),
    });

    expect(raw.nativeArtifacts.map((artifact) => artifact.relativePath)).toEqual([
      "raw-output.abc",
      "converted.musicxml",
      "pages/page-001.abc",
      "pages/page-001.musicxml",
      "pages/page-002.abc",
      "pages/page-002.musicxml",
    ]);
    expect(new TextDecoder().decode(raw.nativeArtifacts[0]?.bytes)).toContain("X:2");
    expect(createAdapter(context).normalize(raw).parts[0]?.staves[0]?.measures).toHaveLength(2);
  });

  it("rejects more than three PDF pages before inference", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      environment: { FAKE_LEGATO_PAGES: "4" },
    });

    await expect(
      adapter.recognize({
        inputPath: join(context.directory, "score.pdf"),
        outputDirectory: join(context.directory, "too-many-pages"),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "unsupported-page-count", pageCount: 4 },
    });
  });

  it("rejects model bytes that do not match the locked hash", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      modelSha256: "0".repeat(64),
    });

    await expect(adapter.inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason: "model-hash-mismatch" },
    });
  });

  it("rejects empty ABC output with a stable reason", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      environment: { FAKE_LEGATO_EMPTY_ABC: "1" },
    });

    await expect(
      adapter.recognize({
        inputPath: join(context.directory, "score.pdf"),
        outputDirectory: join(context.directory, "empty-abc"),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason: "empty-page-abc", pageNumber: 1 },
    });
  });

  it("rejects a declared MusicXML part with no events", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      environment: { FAKE_LEGATO_EMPTY_SECOND_PART: "1" },
    });
    await expect(
      adapter.recognize({
        inputPath: join(context.directory, "score.pdf"),
        outputDirectory: join(context.directory, "empty-part"),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason: "empty-page-part", pageNumber: 1, partId: "P2" },
    });
  });

  it("maps ABC conversion process failures through the shared runner", async () => {
    const context = await createContext();
    const adapter = createLegatoAdapter({
      ...adapterOptions(context),
      environment: { FAKE_LEGATO_CONVERSION_FAILURE: "1" },
    });

    await expect(
      adapter.recognize({
        inputPath: join(context.directory, "score.pdf"),
        outputDirectory: join(context.directory, "conversion-failure"),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "non-zero-exit", exitCode: 17 },
    });
  });
});

async function createContext() {
  await chmod(fixture, 0o755);
  const directory = await mkdtemp(join(tmpdir(), "legato-adapter-"));
  const modelPath = join(directory, "model.safetensors");
  const model = new TextEncoder().encode("locked-legato-model");
  await Promise.all([
    writeFile(modelPath, model),
    writeFile(join(directory, "score.pdf"), "%PDF-fake"),
    writeFile(join(directory, "config.json"), "{}"),
  ]);
  return {
    directory,
    modelPath,
    modelSha256: createHash("sha256").update(model).digest("hex"),
  };
}

function adapterOptions(context: Awaited<ReturnType<typeof createContext>>) {
  return {
    pythonExecutable: fixture,
    gitExecutable: fixture,
    runnerPath: runner,
    repositoryPath: context.directory,
    repositoryRevision: revision,
    modelPath: context.modelPath,
    modelSha256: context.modelSha256,
    baseModelPath: context.directory,
  };
}

function createAdapter(context: Awaited<ReturnType<typeof createContext>>) {
  return createLegatoAdapter(adapterOptions(context));
}
