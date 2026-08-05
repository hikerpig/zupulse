import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import { convertRokotAbc, createRokotAdapter } from "../engines/rokot";
import { parseRokotSystemBundle } from "../normalizers/rokot";

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
        segmentationCropPaddingMultiplier: 4,
        segmentationDetectorVersion: "rokot-grand-staff-v1",
        segmentationHorizontalRunCoverage: 0.05,
        segmentationMaximumGrandStaffGapMultiplier: 10,
        segmentationMaximumStaffSpacingPx: 40,
        segmentationMinimumConnectorCoverage: 0.9,
        segmentationMinimumGrandStaffGapMultiplier: 2,
        segmentationMinimumStaffSpacingPx: 3,
        segmentationSpacingToleranceRatio: 0.25,
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

describe("Rokot recognition adapter", () => {
  it("renders, segments, transcribes, converts, and returns deterministic system artifacts", async () => {
    const context = await createContext();
    const inputPath = join(context.directory, "score.pdf");
    await writeFile(inputPath, grandStaffPdf());
    const adapter = createAdapter(context);

    const first = await adapter.recognize({
      inputPath,
      outputDirectory: join(context.directory, "first"),
    });
    const second = await adapter.recognize({
      inputPath,
      outputDirectory: join(context.directory, "second"),
    });

    expect(first.nativeArtifacts.map((artifact) => artifact.relativePath)).toEqual([
      "segmentation.json",
      "systems/page-001-system-001.png",
      "systems/page-001-system-001.abc",
      "systems/page-001-system-001.musicxml",
      "systems/page-001-system-002.png",
      "systems/page-001-system-002.abc",
      "systems/page-001-system-002.musicxml",
    ]);
    expect(first.nativeArtifacts).toEqual(second.nativeArtifacts);
    const png = first.nativeArtifacts[1]!.bytes;
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const segmentation = JSON.parse(new TextDecoder().decode(first.nativeArtifacts[0]!.bytes)) as {
      systems: Array<Record<string, unknown>>;
    };
    expect(segmentation.systems).toHaveLength(2);
    expect(JSON.stringify(segmentation)).not.toContain("cropPixels");
    expect(segmentation.systems[0]).toMatchObject({
      pageIndex: 0,
      systemIndex: 0,
      pageRenderSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      cropSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      cropPngSha256: sha256Bytes(png),
      pixelBBox: expect.objectContaining({ x: 0, width: 1400 }),
      pdfPointBBox: expect.objectContaining({ x: 0, width: 200 }),
    });
    const bundle = parseRokotSystemBundle(first.normalizationBytes);
    expect(bundle.systems.map((system) => [system.pageIndex, system.systemIndex])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(adapter.normalize(first).parts[0]!.staves[0]!.measures).toHaveLength(2);

    const calls = (await readFile(context.llamaLogPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(calls).toHaveLength(4);
    for (const args of calls) {
      expect(args).toEqual([
        "-m",
        context.modelPath,
        "-mm",
        context.mmprojPath,
        "--image",
        expect.stringMatching(/page-001-system-00[12]\.png$/),
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
        expect.stringMatching(/page-001-system-00[12]\.raw\.abc$/),
      ]);
    }
  });

  it("accepts only the exact llama.cpp chat wrapper and preserves canonical ABC", async () => {
    const context = await createContext({ llamaMode: "wrapper" });
    const inputPath = join(context.directory, "score.pdf");
    await writeFile(inputPath, grandStaffPdf());

    const recognition = await createAdapter(context).recognize({
      inputPath,
      outputDirectory: join(context.directory, "wrapped"),
    });

    const abc = new TextDecoder().decode(
      recognition.nativeArtifacts.find((artifact) => artifact.relativePath.endsWith(".abc"))!.bytes,
    );
    expect(abc.startsWith("%%rokot-abc 0.1\n")).toBe(true);
    expect(abc).not.toContain("User:");
    expect(abc).not.toContain("Assistant:");
  });

  it.each(["leading-prose", "suffix-prose"] as const)("rejects %s around the canonical ABC", async (llamaMode) => {
    const context = await createContext({ llamaMode });
    const inputPath = join(context.directory, "score.pdf");
    await writeFile(inputPath, grandStaffPdf());

    await expect(
      createAdapter(context).recognize({
        inputPath,
        outputDirectory: join(context.directory, llamaMode),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason: "invalid-rokot-abc-envelope" },
    });
  });

  it("propagates llama process failure and cancellation through the shared runner", async () => {
    const failure = await createContext({ llamaMode: "non-zero" });
    const failureInput = join(failure.directory, "score.pdf");
    await writeFile(failureInput, grandStaffPdf());
    await expect(
      createAdapter(failure).recognize({
        inputPath: failureInput,
        outputDirectory: join(failure.directory, "failure"),
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_EXECUTION_FAILED",
      context: { reason: "non-zero-exit", exitCode: 17 },
    });

    const cancelled = await createContext({ llamaMode: "sleep" });
    const cancelledInput = join(cancelled.directory, "score.pdf");
    await writeFile(cancelledInput, grandStaffPdf());
    const controller = new AbortController();
    const pending = createAdapter(cancelled).recognize({
      inputPath: cancelledInput,
      outputDirectory: join(cancelled.directory, "cancelled"),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "INTERRUPTED" });
  });

  it("propagates llama timeout and output limits through the shared runner", async () => {
    const timedOut = await createContext({ llamaMode: "sleep" });
    const timedOutInput = join(timedOut.directory, "score.pdf");
    await writeFile(timedOutInput, grandStaffPdf());
    await expect(
      createRokotAdapter({ ...adapterOptions(timedOut), timeoutMs: 50 }).recognize({
        inputPath: timedOutInput,
        outputDirectory: join(timedOut.directory, "timeout"),
      }),
    ).rejects.toMatchObject({ code: "ENGINE_EXECUTION_FAILED", context: { reason: "timeout" } });

    const excessive = await createContext({ llamaMode: "output-limit" });
    const excessiveInput = join(excessive.directory, "score.pdf");
    await writeFile(excessiveInput, grandStaffPdf());
    await expect(
      createRokotAdapter({ ...adapterOptions(excessive), maxOutputBytes: 64 }).recognize({
        inputPath: excessiveInput,
        outputDirectory: join(excessive.directory, "output-limit"),
      }),
    ).rejects.toMatchObject({ code: "ENGINE_EXECUTION_FAILED", context: { reason: "output-limit" } });
  });
});

type ContextOptions = {
  converterMode?: "empty" | "invalid-xml" | "raise" | "sleep";
  converterVersion?: string;
  llamaMode?: "canonical" | "leading-prose" | "non-zero" | "output-limit" | "sleep" | "suffix-prose" | "wrapper";
  llamaVersion?: string;
};

async function createContext(options: ContextOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "rokot-adapter-"));
  const modelPath = join(directory, "model.gguf");
  const mmprojPath = join(directory, "mmproj.gguf");
  const llamaCliPath = join(directory, "llama-cli");
  const llamaLogPath = join(directory, "llama-calls.jsonl");
  const packageDirectory = join(directory, "python", "abc_xml_converter");
  const metadataDirectory = join(directory, "python", "abc_xml_converter-1.0.1.dist-info");
  const model = new TextEncoder().encode("locked-rokot-model");
  const mmproj = new TextEncoder().encode("locked-rokot-mmproj");
  const converterMode = options.converterMode ?? "valid";
  await Promise.all([mkdir(packageDirectory, { recursive: true }), mkdir(metadataDirectory, { recursive: true })]);
  await Promise.all([
    writeFile(modelPath, model),
    writeFile(mmprojPath, mmproj),
    writeFile(llamaCliPath, fakeLlamaScript(options.llamaVersion ?? "version: 10200 (5f55650a7)")),
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
        `    return ${JSON.stringify(validRokotMusicXml())}`,
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
    environment: {
      FAKE_ROKOT_LLAMA_LOG: llamaLogPath,
      FAKE_ROKOT_LLAMA_MODE: options.llamaMode ?? "canonical",
      PYTHONPATH: join(directory, "python"),
    },
    llamaCliPath,
    llamaLogPath,
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

function fakeLlamaScript(version: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") {
  process.stdout.write(${JSON.stringify(version)} + "\\n");
  process.exit(0);
}
fs.appendFileSync(process.env.FAKE_ROKOT_LLAMA_LOG, JSON.stringify(args) + "\\n");
const mode = process.env.FAKE_ROKOT_LLAMA_MODE;
if (mode === "non-zero") process.exit(17);
if (mode === "output-limit") process.stdout.write("x".repeat(4096));
if (mode === "sleep") setTimeout(() => process.exit(0), 10000);
else {
  const outputIndex = args.indexOf("-o");
  const abc = ${JSON.stringify(validRokotAbc())};
  const response = mode === "wrapper"
    ? "User:\\nTranscribe this staff to rokot-ABC.\\n\\nAssistant:\\n" + abc
    : mode === "leading-prose"
      ? "Here is the score:\\n" + abc
      : mode === "suffix-prose"
        ? abc + "Done.\\n"
        : abc;
  fs.writeFileSync(args[outputIndex + 1], response);
}
`;
}

function validRokotAbc(): string {
  return `%%rokot-abc 0.1
X:1
M:2/4
L:1/8
K:C
V:1 clef=treble
V:2 clef=bass
[V:1] C4 |
[V:2] C,4 |
`;
}

function validRokotMusicXml(): string {
  return `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right</part-name></score-part>
    <score-part id="P2"><part-name>Left</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1"><attributes><divisions>8</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure></part>
  <part id="P2"><measure number="1"><attributes><divisions>8</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice></note></measure></part>
</score-partwise>`;
}

function grandStaffPdf(): Uint8Array {
  const systems = [
    [220, 216, 212, 208, 204, 190, 186, 182, 178, 174],
    [110, 106, 102, 98, 94, 80, 76, 72, 68, 64],
  ];
  const commands = systems.flatMap((lines) => [
    ...lines.map((y) => `10 ${y} m 190 ${y} l S`),
    `10 ${lines[0]} m 10 ${lines[9]} l S`,
  ]);
  return pdf([{ width: 200, height: 260, content: `0 0 0 RG 0.3 w ${commands.join(" ")}` }]);
}

function pdf(pages: readonly { width: number; height: number; content: string }[]): Uint8Array {
  const pageIds = pages.map((_, index) => index + 3);
  const contentIds = pages.map((_, index) => pages.length + index + 3);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pages.map(
      (page, index) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << >> /Contents ${contentIds[index]} 0 R >>`,
    ),
    ...pages.map((page) => `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`),
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}
