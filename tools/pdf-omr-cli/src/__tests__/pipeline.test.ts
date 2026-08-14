import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineRegistry } from "../engine-registry";
import { PdfOmrError } from "../errors";
import type { OmrEngineAdapter } from "../engines/types";
import { runPdfOmrPipeline, type PdfOmrPipelineProgressEvent } from "../pipeline";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

describe("runPdfOmrPipeline", () => {
  it("runs the complete recognition pipeline without exposing absolute paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-pipeline-"));
    const inputPath = join(directory, "private", "score.pdf");
    const outputPath = join(directory, "run");
    await writeFileWithParent(inputPath, minimalPdf());

    const result = await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: outputPath,
      engineRegistry: registryWith(readyAdapter()),
    });

    expect(result).toMatchObject({
      schemaVersion: "1.0.0",
      status: "succeeded",
      input: { fileName: "score.pdf", pageCount: 1 },
      engine: { id: "fake", version: "1.0.0" },
      validation: { readiness: { harmony: "ready", musicXml: "ready" } },
      artifacts: {
        inspect: "inspect/input.json",
        recognitionDirectory: "recognition",
        validation: "validation.json",
        musicXml: "score.mxl",
        roundTrip: "round-trip.json",
      },
    });
    expect(JSON.stringify(result)).not.toContain(directory);
    await expect(access(join(outputPath, result.artifacts.musicXml))).resolves.toBeUndefined();
    await expect(access(join(outputPath, result.artifacts.roundTrip))).resolves.toBeUndefined();
  });

  it("runs the same pipeline for a single-page PNG input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-image-pipeline-"));
    const inputPath = join(directory, "score.png");
    await writeFile(inputPath, minimalPng(640, 480));

    const result = await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: join(directory, "run"),
      engineRegistry: registryWith(readyAdapter()),
    });

    expect(result.input).toMatchObject({ fileName: "score.png", pageCount: 1 });
  });

  it("forwards cancellation and never publishes an exportable score", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-pipeline-cancel-"));
    const inputPath = join(directory, "score.pdf");
    const outputPath = join(directory, "run");
    const controller = new AbortController();
    const progress: PdfOmrPipelineProgressEvent[] = [];
    await writeFile(inputPath, minimalPdf());

    const operation = runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: outputPath,
      engineRegistry: registryWith(cancellableAdapter()),
      signal: controller.signal,
      onProgress: (event) => progress.push(event),
    });
    controller.abort();

    await expect(operation).rejects.toMatchObject({ code: "INTERRUPTED" });
    await expect(access(join(outputPath, "score.mxl"))).rejects.toBeDefined();
    expect(progress.at(-1)).toMatchObject({ kind: "terminal", status: "cancelled", errorCode: "INTERRUPTED" });
  });

  it("emits ordered stages and optional engine-supplied counters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-pipeline-progress-"));
    const inputPath = join(directory, "score.pdf");
    const progress: PdfOmrPipelineProgressEvent[] = [];
    await writeFile(inputPath, minimalPdf());

    await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: join(directory, "run"),
      engineRegistry: registryWith(progressiveAdapter()),
      onProgress: (event) => progress.push(event),
    });

    expect(progress).toEqual([
      { schemaVersion: "1.0.0", sequence: 0, kind: "stage", stage: "inspect", status: "started" },
      { schemaVersion: "1.0.0", sequence: 1, kind: "stage", stage: "inspect", status: "completed" },
      { schemaVersion: "1.0.0", sequence: 2, kind: "stage", stage: "recognize", status: "started" },
      {
        schemaVersion: "1.0.0",
        sequence: 3,
        kind: "engine-progress",
        stage: "recognize",
        unit: "system",
        completed: 1,
        total: 2,
      },
      {
        schemaVersion: "1.0.0",
        sequence: 4,
        kind: "engine-progress",
        stage: "recognize",
        unit: "system",
        completed: 2,
        total: 2,
      },
      { schemaVersion: "1.0.0", sequence: 5, kind: "stage", stage: "recognize", status: "completed" },
      { schemaVersion: "1.0.0", sequence: 6, kind: "stage", stage: "validate", status: "started" },
      { schemaVersion: "1.0.0", sequence: 7, kind: "stage", stage: "validate", status: "completed" },
      { schemaVersion: "1.0.0", sequence: 8, kind: "stage", stage: "export", status: "started" },
      { schemaVersion: "1.0.0", sequence: 9, kind: "stage", stage: "export", status: "completed" },
      { schemaVersion: "1.0.0", sequence: 10, kind: "terminal", status: "succeeded" },
    ]);
  });

  it("keeps canonical artifacts byte-identical when progress is observed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-pipeline-parity-"));
    const inputPath = join(directory, "score.pdf");
    const withoutProgress = join(directory, "without-progress");
    const withProgress = join(directory, "with-progress");
    await writeFile(inputPath, minimalPdf());

    await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: withoutProgress,
      engineRegistry: registryWith(readyAdapter()),
    });
    await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: withProgress,
      engineRegistry: registryWith(readyAdapter()),
      onProgress: () => {},
    });

    for (const artifact of [
      "inspect/input.json",
      "recognition/input.json",
      "recognition/engine/environment.json",
      "recognition/draft.json",
      "recognition/diagnostics.json",
      "validation.json",
      "score.mxl",
      "round-trip.json",
    ]) {
      expect(await readFile(join(withProgress, artifact))).toEqual(await readFile(join(withoutProgress, artifact)));
    }
  });

  it("publishes only valid monotonic engine counters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-pipeline-counter-validation-"));
    const inputPath = join(directory, "score.pdf");
    const progress: PdfOmrPipelineProgressEvent[] = [];
    await writeFile(inputPath, minimalPdf());

    await runPdfOmrPipeline({
      inputPath,
      engineId: "fake",
      outputDirectory: join(directory, "run"),
      engineRegistry: registryWith(noisyProgressAdapter()),
      onProgress: (event) => progress.push(event),
    });

    expect(progress.filter((event) => event.kind === "engine-progress")).toEqual([
      {
        schemaVersion: "1.0.0",
        sequence: 3,
        kind: "engine-progress",
        stage: "recognize",
        unit: "system",
        completed: 1,
        total: 2,
      },
      {
        schemaVersion: "1.0.0",
        sequence: 4,
        kind: "engine-progress",
        stage: "recognize",
        unit: "system",
        completed: 2,
        total: 2,
      },
      {
        schemaVersion: "1.0.0",
        sequence: 5,
        kind: "engine-progress",
        stage: "recognize",
        unit: "page",
        completed: 1,
        total: 1,
      },
    ]);
  });
});

function registryWith(adapter: OmrEngineAdapter): EngineRegistry {
  return {
    get(engineId) {
      if (engineId !== "fake") throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown engine");
      return adapter;
    },
  };
}

function readyAdapter(): OmrEngineAdapter {
  return {
    async inspectEnvironment() {
      return {
        id: "fake",
        version: "1.0.0",
        executable: "fake-engine",
        commandTemplate: ["fake-engine", "<input>", "<output>"],
        inputKinds: ["pdf", "image"],
        license: { id: "MIT", source: "test" },
      };
    },
    async recognize() {
      return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 1 };
    },
    normalize() {
      return musicXmlReadyDraft();
    },
  };
}

function cancellableAdapter(): OmrEngineAdapter {
  return {
    ...readyAdapter(),
    async recognize(request) {
      return new Promise((_resolve, reject) => {
        const rejectInterrupted = () => reject(new PdfOmrError("INTERRUPTED", "engine execution was interrupted"));
        if (request.signal?.aborted) rejectInterrupted();
        else request.signal?.addEventListener("abort", rejectInterrupted, { once: true });
      });
    },
  };
}

function progressiveAdapter(): OmrEngineAdapter {
  return {
    ...readyAdapter(),
    async recognize(request) {
      request.onProgress?.({ unit: "system", completed: 1, total: 2 });
      request.onProgress?.({ unit: "system", completed: 2, total: 2 });
      return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 1 };
    },
  };
}

function noisyProgressAdapter(): OmrEngineAdapter {
  return {
    ...readyAdapter(),
    async recognize(request) {
      request.onProgress?.({ unit: "system", completed: 1, total: 2 });
      request.onProgress?.({ unit: "system", completed: 0, total: 2 });
      request.onProgress?.({ unit: "system", completed: 2, total: 3 });
      request.onProgress?.({ unit: "system", completed: 2, total: 2 });
      request.onProgress?.({ unit: "system", completed: 3, total: 2 });
      request.onProgress?.({ unit: "page", completed: 1, total: 1 });
      return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 1 };
    },
  };
}

async function writeFileWithParent(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function minimalPdf(): Uint8Array {
  const content = "0 0 m 100 100 l S";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
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

function minimalPng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
