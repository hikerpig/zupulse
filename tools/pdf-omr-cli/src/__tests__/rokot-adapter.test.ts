import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertRokotAbc, createRokotAdapter } from "../engines/rokot";

const runnerPath = fileURLToPath(new URL("../../engines/rokot-abc2xml-runner.py", import.meta.url));
const modelRevision = "7add305aade6fb3a64ad4dde77d410fa68381089";
const llamaBuild = "b10200-5f55650a7";

describe("Rokot adapter environment", () => {
  it("reports locked model, projector, runtime, converter, and decoder provenance", async () => {
    const context = await createContext();

    await expect(createAdapter(context).inspectEnvironment()).resolves.toEqual({
      id: "rokot",
      version: modelRevision,
      executable: "llama-cli",
      modelSha256: context.modelSha256,
      parameters: {
        abcConverterLicense: "LGPL-3.0-only",
        abcConverterPackage: "abc-xml-converter",
        abcConverterVersion: "1.0.1",
        concurrency: 1,
        llamaCppBuild: llamaBuild,
        maxNewTokens: 1600,
        modelRevision,
        prompt: "Transcribe this staff to rokot-ABC.",
        reasoning: "off",
        temperature: 0,
        visionProjectorSha256: context.mmprojSha256,
      },
      commandTemplate: [
        "-m",
        "<model.gguf>",
        "-mm",
        "<mmproj.gguf>",
        "--image",
        "<system.png>",
        "-p",
        "Transcribe this staff to rokot-ABC.",
        "-n",
        "1600",
        "--temp",
        "0",
        "--single-turn",
        "--reasoning",
        "off",
        "--no-display-prompt",
        "--no-show-timings",
        "-o",
        "<system.abc>",
      ],
      license: {
        id: "CC-BY-NC-4.0",
        source: "https://huggingface.co/rokotmidi/rokot-omr-2b",
      },
    });
  });

  it("rejects missing explicit paths before starting a process", async () => {
    await expect(createRokotAdapter({}).inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason: "missing-rokot-configuration" },
    });
  });

  it.each([
    ["model", "model-unreadable"],
    ["mmproj", "mmproj-unreadable"],
  ] as const)("maps an unreadable %s to a stable reason", async (target, reason) => {
    const context = await createContext();
    const options = adapterOptions(context);
    if (target === "model") options.modelPath = join(context.directory, "missing-model.gguf");
    else options.mmprojPath = join(context.directory, "missing-mmproj.gguf");

    await expect(createRokotAdapter(options).inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason },
    });
  });

  it.each([
    ["model", "model-hash-mismatch"],
    ["mmproj", "mmproj-hash-mismatch"],
  ] as const)("maps a mismatched %s hash to a stable reason", async (target, reason) => {
    const context = await createContext();
    const options = adapterOptions(context);
    if (target === "model") options.modelSha256 = "0".repeat(64);
    else options.mmprojSha256 = "0".repeat(64);

    await expect(createRokotAdapter(options).inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason },
    });
  });

  it("rejects a llama.cpp build that does not match the lock", async () => {
    const context = await createContext({ llamaVersion: "version: 99999 (deadbeef0)" });

    await expect(createAdapter(context).inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason: "llama-build-mismatch" },
    });
  });

  it("rejects an unavailable converter import with a stable reason", async () => {
    const context = await createContext({ converterVersion: "9.9.9" });

    await expect(createAdapter(context).inspectEnvironment()).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      context: { reason: "abc-converter-unavailable" },
    });
  });
});

describe("Rokot ABC converter boundary", () => {
  it("converts ABC through the isolated runner without a stdout payload", async () => {
    const context = await createContext();
    const inputPath = join(context.directory, "system.abc");
    const outputPath = join(context.directory, "system.musicxml");
    await writeFile(inputPath, "X:1\nM:4/4\nL:1/4\nK:C\nC D E F |\n");

    const result = await convertRokotAbc({
      pythonExecutable: context.pythonExecutable,
      runnerPath,
      inputPath,
      outputPath,
      environment: context.environment,
    });

    expect(result.stdout).toBe("");
    await expect(readFile(outputPath, "utf8")).resolves.toContain("<score-partwise");
  });

  it.each([
    ["raise", "abc-conversion-failed"],
    ["empty", "empty-abc-conversion-output"],
    ["invalid-xml", "invalid-abc-conversion-xml"],
  ] as const)("maps %s converter output to %s", async (mode, reason) => {
    const context = await createContext({ converterMode: mode });
    const inputPath = join(context.directory, "system.abc");
    const outputPath = join(context.directory, "system.musicxml");
    await writeFile(inputPath, "X:1\nM:4/4\nL:1/4\nK:C\nC |\n");

    await expect(
      convertRokotAbc({
        pythonExecutable: context.pythonExecutable,
        runnerPath,
        inputPath,
        outputPath,
        environment: context.environment,
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason },
    });
  });

  it("preserves cancellation from the shared process runner", async () => {
    const context = await createContext({ converterMode: "sleep" });
    const inputPath = join(context.directory, "system.abc");
    const outputPath = join(context.directory, "system.musicxml");
    await writeFile(inputPath, "X:1\nM:4/4\nL:1/4\nK:C\nC |\n");
    const controller = new AbortController();
    const pending = convertRokotAbc(
      {
        pythonExecutable: context.pythonExecutable,
        runnerPath,
        inputPath,
        outputPath,
        environment: context.environment,
      },
      controller.signal,
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "INTERRUPTED" });
  });
});

type ContextOptions = {
  converterMode?: "empty" | "invalid-xml" | "raise" | "sleep";
  converterVersion?: string;
  llamaVersion?: string;
};

async function createContext(options: ContextOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "rokot-adapter-"));
  const modelPath = join(directory, "model.gguf");
  const mmprojPath = join(directory, "mmproj.gguf");
  const llamaCliPath = join(directory, "llama-cli");
  const packageDirectory = join(directory, "python", "abc_xml_converter");
  const metadataDirectory = join(directory, "python", "abc_xml_converter-1.0.1.dist-info");
  const model = new TextEncoder().encode("locked-rokot-model");
  const mmproj = new TextEncoder().encode("locked-rokot-mmproj");
  const converterMode = options.converterMode ?? "valid";
  await Promise.all([mkdir(packageDirectory, { recursive: true }), mkdir(metadataDirectory, { recursive: true })]);
  await Promise.all([
    writeFile(modelPath, model),
    writeFile(mmprojPath, mmproj),
    writeFile(
      llamaCliPath,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(options.llamaVersion ?? "version: 10200 (5f55650a7)")} + "\\n");\n`,
    ),
    writeFile(
      join(packageDirectory, "__init__.py"),
      [
        "import os",
        "import time",
        "def convert_abc2xml(**_kwargs):",
        converterMode === "raise" ? "    raise RuntimeError('fixture failure')" : "    pass",
        converterMode === "sleep" ? "    time.sleep(10)" : "    pass",
        converterMode === "empty" ? "    return ''" : "    pass",
        converterMode === "invalid-xml" ? "    return '<score-partwise>'" : "    pass",
        '    return \'<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>\'',
      ].join("\n"),
    ),
    writeFile(
      join(metadataDirectory, "METADATA"),
      `Metadata-Version: 2.1\nName: abc-xml-converter\nVersion: ${options.converterVersion ?? "1.0.1"}\n`,
    ),
  ]);
  await chmod(llamaCliPath, 0o755);
  return {
    directory,
    environment: { PYTHONPATH: join(directory, "python") },
    llamaCliPath,
    mmprojPath,
    mmprojSha256: createHash("sha256").update(mmproj).digest("hex"),
    modelPath,
    modelSha256: createHash("sha256").update(model).digest("hex"),
    pythonExecutable: "python3",
  };
}

function adapterOptions(context: Awaited<ReturnType<typeof createContext>>) {
  return {
    abc2xmlPythonPath: context.pythonExecutable,
    abc2xmlRunnerPath: runnerPath,
    environment: context.environment,
    llamaBuild,
    llamaCliPath: context.llamaCliPath,
    mmprojPath: context.mmprojPath,
    mmprojSha256: context.mmprojSha256,
    modelPath: context.modelPath,
    modelRevision,
    modelSha256: context.modelSha256,
  };
}

function createAdapter(context: Awaited<ReturnType<typeof createContext>>) {
  return createRokotAdapter(adapterOptions(context));
}
