import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PdfOmrError } from "../errors";
import { fillVoiceGapsWithRests } from "../draft-gap-fill";
import { runEngineProcess } from "../engine-runner";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { combineProcessResourceUsage } from "../resource-metrics";
import { mergeLegatoPageAbc, mergeLegatoPageMusicXml } from "./legato-page-merge";
import { parseLegatoProgressLine } from "./legato-progress";
import { LegatoWorker } from "./legato-worker";
import type { DecoderTelemetry, OmrEngineAdapter } from "./types";

export type LegatoDecoderConfig = {
  maxLength: number;
  numBeams: number;
  repetitionPenalty: number;
};

export type LegatoAdapterOptions = {
  pythonExecutable: string;
  gitExecutable?: string;
  runnerPath: string;
  repositoryPath: string;
  repositoryRevision: string;
  modelPath: string;
  modelSha256: string;
  baseModelPath: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  decoder?: LegatoDecoderConfig;
  workerMode?: boolean;
};

type InspectReport = {
  pageCount: number;
};

const baselineDecoder: LegatoDecoderConfig = {
  maxLength: 2048,
  numBeams: 1,
  repetitionPenalty: 1.1,
};

const maxNumBeams = 10;
const maxPdfPages = 32;

const defaultInferenceTimeoutMs = 3_600_000;

export function createLegatoAdapter(options: LegatoAdapterOptions): OmrEngineAdapter {
  const decoder = options.decoder ?? baselineDecoder;
  validateDecoderConfig(decoder);
  const gitExecutable = options.gitExecutable ?? "git";
  const inferenceTimeoutMs = options.timeoutMs ?? defaultInferenceTimeoutMs;
  const processOptions = {
    ...(options.environment === undefined ? {} : { env: options.environment }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
  const worker =
    options.workerMode === true
      ? new LegatoWorker({
          command: options.pythonExecutable,
          args: [
            options.runnerPath,
            "worker",
            "--repository",
            options.repositoryPath,
            "--model",
            dirname(options.modelPath),
            "--base-model",
            options.baseModelPath,
            "--max-length",
            String(decoder.maxLength),
            "--num-beams",
            String(decoder.numBeams),
            "--repetition-penalty",
            String(decoder.repetitionPenalty),
          ],
          ...(options.environment === undefined ? {} : { environment: options.environment }),
          timeoutMs: inferenceTimeoutMs,
        })
      : undefined;

  return {
    async inspectEnvironment(signal) {
      const [python, revision, modelBytes, baseConfig] = await Promise.all([
        runEngineProcess({ command: options.pythonExecutable, args: ["--version"], ...processOptions }, signal),
        runEngineProcess(
          {
            command: gitExecutable,
            args: ["-C", options.repositoryPath, "rev-parse", "HEAD"],
            ...processOptions,
          },
          signal,
        ),
        readFile(options.modelPath).catch((error: unknown) => {
          throw unavailable("model-unreadable", error);
        }),
        readFile(join(options.baseModelPath, "config.json")).catch((error: unknown) => {
          throw unavailable("base-model-unreadable", error);
        }),
      ]);
      if (!`${python.stdout}\n${python.stderr}`.startsWith("Python 3.11.")) {
        throw unavailable("python-version-mismatch");
      }
      const actualRevision = revision.stdout.trim();
      if (actualRevision !== options.repositoryRevision) {
        throw unavailable("repository-revision-mismatch");
      }
      const actualModelSha256 = createHash("sha256").update(modelBytes).digest("hex");
      if (actualModelSha256 !== options.modelSha256) {
        throw unavailable("model-hash-mismatch");
      }
      if (baseConfig.byteLength === 0) throw unavailable("base-model-config-empty");
      return {
        id: "legato",
        version: actualRevision,
        executable: basename(options.pythonExecutable),
        modelSha256: actualModelSha256,
        parameters: { ...decoder, maxPdfPages, inferenceTimeoutMs },
        commandTemplate: [
          "legato-runner.py",
          "recognize",
          "--input",
          "<input.pdf>",
          "--model",
          "<legato-model>",
          "--base-model",
          "<llama-vision-model>",
          "--page-output-directory",
          "<page-output-directory>",
        ],
        license: {
          id: "MIT + Llama-3.2-Community",
          source: "https://huggingface.co/guangyangmusic/legato",
        },
      };
    },

    async recognize(request) {
      await mkdir(request.outputDirectory, { recursive: true });
      const inspect = await runEngineProcess(
        {
          command: options.pythonExecutable,
          args: [options.runnerPath, "inspect", "--input", request.inputPath],
          ...processOptions,
        },
        request.signal,
      );
      const report = parseInspectReport(inspect.stdout);
      if (report.pageCount < 1 || report.pageCount > maxPdfPages) {
        throw new PdfOmrError("INVALID_INPUT", `LEGATO supports one to ${maxPdfPages} PDF pages`, {
          context: { reason: "unsupported-page-count", pageCount: report.pageCount },
        });
      }
      // Publish the total immediately so hosts can show "0 / N" during the first page's inference.
      request.onProgress?.({ unit: "page", completed: 0, total: report.pageCount });

      const abcPath = join(request.outputDirectory, "raw-output.abc");
      const musicXmlPath = join(request.outputDirectory, "converted.musicxml");
      const telemetryPath = join(request.outputDirectory, "inference.json");
      const pageOutputDirectory = join(request.outputDirectory, "pages");
      const forwardProgress = (progress: { completed: number; total: number }) => {
        request.onProgress?.({ unit: "page", completed: progress.completed, total: progress.total });
      };
      const onStderrLine = (line: string) => {
        const progress = parseLegatoProgressLine(line);
        if (progress !== undefined) forwardProgress(progress);
      };
      const inference =
        worker === undefined
          ? await runEngineProcess(
              {
                command: options.pythonExecutable,
                args: [
                  options.runnerPath,
                  "recognize",
                  "--input",
                  request.inputPath,
                  "--repository",
                  options.repositoryPath,
                  "--model",
                  dirname(options.modelPath),
                  "--base-model",
                  options.baseModelPath,
                  "--page-output-directory",
                  pageOutputDirectory,
                  "--telemetry-output",
                  telemetryPath,
                  "--max-length",
                  String(decoder.maxLength),
                  "--num-beams",
                  String(decoder.numBeams),
                  "--repetition-penalty",
                  String(decoder.repetitionPenalty),
                ],
                ...processOptions,
                timeoutMs: inferenceTimeoutMs,
                onStderrLine,
              },
              request.signal,
            )
          : await worker.run({
              inputPath: request.inputPath,
              pageOutputDirectory,
              telemetryOutputPath: telemetryPath,
              ...(request.signal === undefined ? {} : { signal: request.signal }),
              ...(request.onProgress === undefined ? {} : { onProgress: forwardProgress }),
            });
      const [pageArtifacts, telemetryBytes] = await Promise.all([
        Promise.all(
          Array.from({ length: report.pageCount }, async (_, pageIndex) => {
            const pageNumber = pageIndex + 1;
            const prefix = `page-${String(pageNumber).padStart(3, "0")}`;
            const [abcBytes, musicXmlBytes] = await Promise.all([
              readFile(join(pageOutputDirectory, `${prefix}.abc`)).catch((error: unknown) => {
                throw invalidOutput("missing-page-abc", error);
              }),
              readFile(join(pageOutputDirectory, `${prefix}.musicxml`)).catch((error: unknown) => {
                throw invalidOutput("missing-page-musicxml", error);
              }),
            ]);
            let abc: string;
            try {
              abc = new TextDecoder("utf-8", { fatal: true }).decode(abcBytes);
            } catch (error) {
              throw invalidOutput("invalid-page-abc-utf8", error);
            }
            return { prefix, abc, abcBytes, musicXmlBytes };
          }),
        ),
        readFile(telemetryPath).catch((error: unknown) => {
          throw invalidOutput("missing-inference-telemetry", error);
        }),
      ]);
      const parsedTelemetry = parseDecoderTelemetry(telemetryBytes, report.pageCount, decoder.maxLength);
      const decoderTelemetry: DecoderTelemetry =
        "warm" in inference
          ? {
              ...parsedTelemetry,
              workerRequests: [
                {
                  warm: inference.warm,
                  requestDurationMs: inference.requestDurationMs,
                  ...(inference.modelLoadMs === undefined ? {} : { modelLoadMs: inference.modelLoadMs }),
                },
              ],
            }
          : parsedTelemetry;
      const abc = mergeLegatoPageAbc(pageArtifacts.map((artifact) => artifact.abc));
      const abcBytes = new TextEncoder().encode(abc);
      const musicXmlBytes = mergeLegatoPageMusicXml(pageArtifacts.map((artifact) => artifact.musicXmlBytes));
      await Promise.all([writeFile(abcPath, abcBytes), writeFile(musicXmlPath, musicXmlBytes)]);
      return {
        normalizationBytes: musicXmlBytes,
        nativeArtifacts: [
          { relativePath: "raw-output.abc", bytes: abcBytes },
          { relativePath: "converted.musicxml", bytes: musicXmlBytes },
          { relativePath: "inference.json", bytes: telemetryBytes },
          ...pageArtifacts.flatMap((artifact) => [
            { relativePath: `pages/${artifact.prefix}.abc`, bytes: artifact.abcBytes },
            { relativePath: `pages/${artifact.prefix}.musicxml`, bytes: artifact.musicXmlBytes },
          ]),
        ],
        diagnostics: [],
        durationMs: inspect.durationMs + inference.durationMs,
        resourceUsage: combineProcessResourceUsage([inspect.resourceUsage, inference.resourceUsage])!,
        decoderTelemetry,
      };
    },

    normalize(recognition) {
      const draft = normalizeAudiverisMusicXml(recognition.normalizationBytes);
      const emptyPart = draft.parts.find(
        (part) =>
          !part.staves.some((staff) =>
            staff.measures.some((measure) => measure.voices.some((voice) => voice.events.length > 0)),
          ),
      );
      if (emptyPart !== undefined) {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "LEGATO output contains an empty part", {
          context: { reason: "empty-part", partId: emptyPart.id },
        });
      }
      return fillVoiceGapsWithRests(draft);
    },
    ...(worker === undefined ? {} : { close: () => worker.close() }),
  };
}

function validateDecoderConfig(decoder: LegatoDecoderConfig): void {
  if (
    !Number.isSafeInteger(decoder.maxLength) ||
    decoder.maxLength < 1 ||
    decoder.maxLength > baselineDecoder.maxLength ||
    !Number.isSafeInteger(decoder.numBeams) ||
    decoder.numBeams < 1 ||
    decoder.numBeams > maxNumBeams ||
    !Number.isFinite(decoder.repetitionPenalty) ||
    decoder.repetitionPenalty < 1 ||
    decoder.repetitionPenalty > 2
  ) {
    throw new PdfOmrError("INVALID_CLI_ARGUMENT", "invalid LEGATO decoder configuration", {
      context: { reason: "invalid-decoder-configuration" },
    });
  }
}

function parseDecoderTelemetry(bytes: Uint8Array, pageCount: number, maxLength: number): DecoderTelemetry {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof value !== "object" || value === null || !("schemaVersion" in value) || !("pages" in value)) {
      throw new Error("invalid-shape");
    }
    if (value.schemaVersion !== "1.0.0" || !Array.isArray(value.pages) || value.pages.length !== pageCount) {
      throw new Error("invalid-header");
    }
    const pages = value.pages.map((page: unknown, pageIndex: number) => {
      if (typeof page !== "object" || page === null) throw new Error("invalid-page");
      const record = page as Record<string, unknown>;
      if (
        record.pageNumber !== pageIndex + 1 ||
        !Number.isSafeInteger(record.outputTokenCount) ||
        (record.outputTokenCount as number) < 1 ||
        record.maxLength !== maxLength ||
        !["eos", "max-length", "other"].includes(record.termination as string) ||
        typeof record.device !== "string" ||
        record.device.length === 0 ||
        typeof record.dtype !== "string" ||
        record.dtype.length === 0
      ) {
        throw new Error("invalid-page");
      }
      return {
        pageNumber: record.pageNumber as number,
        outputTokenCount: record.outputTokenCount as number,
        maxLength: record.maxLength as number,
        termination: record.termination as "eos" | "max-length" | "other",
        device: record.device,
        dtype: record.dtype,
      };
    });
    return { schemaVersion: "1.0.0", pages };
  } catch (error) {
    throw invalidOutput("invalid-inference-telemetry", error);
  }
}

function parseInspectReport(stdout: string): InspectReport {
  try {
    const value: unknown = JSON.parse(stdout);
    if (
      typeof value !== "object" ||
      value === null ||
      !("pageCount" in value) ||
      !Number.isSafeInteger(value.pageCount) ||
      (value.pageCount as number) < 0
    ) {
      throw new Error("invalid-page-count");
    }
    return { pageCount: value.pageCount as number };
  } catch (error) {
    throw invalidOutput("invalid-inspect-report", error);
  }
}

function unavailable(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_UNAVAILABLE", "LEGATO environment is unavailable", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidOutput(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "LEGATO output is invalid", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
