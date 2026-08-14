import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { PdfOmrError } from "../errors";
import { runEngineProcess } from "../engine-runner";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { mergeLegatoPageAbc, mergeLegatoPageMusicXml } from "./legato-page-merge";
import type { OmrEngineAdapter } from "./types";

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
};

type InspectReport = {
  pageCount: number;
};

const parameters = {
  maxLength: 2048,
  maxPdfPages: 3,
  numBeams: 10,
  repetitionPenalty: 1.1,
} as const;

const defaultInferenceTimeoutMs = 3_600_000;

export function createLegatoAdapter(options: LegatoAdapterOptions): OmrEngineAdapter {
  const gitExecutable = options.gitExecutable ?? "git";
  const inferenceTimeoutMs = options.timeoutMs ?? defaultInferenceTimeoutMs;
  const processOptions = {
    ...(options.environment === undefined ? {} : { env: options.environment }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };

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
      if (!/^Python 3\.11\./.test(`${python.stdout}\n${python.stderr}`)) {
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
        parameters: { ...parameters, inferenceTimeoutMs },
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
      if (report.pageCount < 1 || report.pageCount > parameters.maxPdfPages) {
        throw new PdfOmrError("INVALID_INPUT", "LEGATO supports one to three PDF pages", {
          context: { reason: "unsupported-page-count", pageCount: report.pageCount },
        });
      }

      const abcPath = join(request.outputDirectory, "raw-output.abc");
      const musicXmlPath = join(request.outputDirectory, "converted.musicxml");
      const pageOutputDirectory = join(request.outputDirectory, "pages");
      const inference = await runEngineProcess(
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
            "--max-length",
            String(parameters.maxLength),
            "--num-beams",
            String(parameters.numBeams),
            "--repetition-penalty",
            String(parameters.repetitionPenalty),
          ],
          ...processOptions,
          timeoutMs: inferenceTimeoutMs,
        },
        request.signal,
      );
      const pageArtifacts = await Promise.all(
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
      );
      const abc = mergeLegatoPageAbc(pageArtifacts.map((artifact) => artifact.abc));
      const abcBytes = new TextEncoder().encode(abc);
      const musicXmlBytes = mergeLegatoPageMusicXml(pageArtifacts.map((artifact) => artifact.musicXmlBytes));
      await Promise.all([writeFile(abcPath, abcBytes), writeFile(musicXmlPath, musicXmlBytes)]);
      return {
        normalizationBytes: musicXmlBytes,
        nativeArtifacts: [
          { relativePath: "raw-output.abc", bytes: abcBytes },
          { relativePath: "converted.musicxml", bytes: musicXmlBytes },
          ...pageArtifacts.flatMap((artifact) => [
            { relativePath: `pages/${artifact.prefix}.abc`, bytes: artifact.abcBytes },
            { relativePath: `pages/${artifact.prefix}.musicxml`, bytes: artifact.musicXmlBytes },
          ]),
        ],
        diagnostics: [],
        durationMs: inspect.durationMs + inference.durationMs,
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
      return draft;
    },
  };
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
