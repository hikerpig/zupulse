import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { PdfOmrError } from "../errors";
import { runEngineProcess } from "../engine-runner";
import { normalizeTranscodaOutput, prepareTranscodaKern } from "../normalizers/transcoda";
import type { OmrEngineAdapter } from "./types";

const modelId = "btrkeks/transcoda-59M-zeroshot-v1";
const modelRevision = "b529f8aa5d996d9224df3395b5b92d0867343c91";

export type TranscodaAdapterOptions = {
  pythonExecutable: string;
  gitExecutable?: string;
  pdftoppmExecutable?: string;
  converterScriptPath?: string;
  repositoryPath: string;
  repositoryRevision: string;
  checkpointPath: string;
  checkpointSha256: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
};

export function createTranscodaAdapter(options: TranscodaAdapterOptions): OmrEngineAdapter {
  const gitExecutable = options.gitExecutable ?? "git";
  const pdftoppmExecutable = options.pdftoppmExecutable ?? "pdftoppm";
  const converterScriptPath =
    options.converterScriptPath ??
    fileURLToPath(new URL("../../engines/transcoda-kern-to-musicxml.py", import.meta.url));
  const processOptions = {
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.environment === undefined ? {} : { env: options.environment }),
  };
  const parameters = {
    grammarConstrained: true,
    layoutNormalization: true,
    maxLength: 512,
    rasterDpi: 150,
    repetitionPenalty: 1.1,
  } as const;

  return {
    async inspectEnvironment(signal) {
      const [python, revision, checkpoint] = await Promise.all([
        runEngineProcess({ command: options.pythonExecutable, args: ["--version"], ...processOptions }, signal),
        runEngineProcess(
          {
            command: gitExecutable,
            args: ["-C", options.repositoryPath, "rev-parse", "HEAD"],
            ...processOptions,
          },
          signal,
        ),
        readFile(options.checkpointPath).catch((error: unknown) => {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda checkpoint cannot be read", {
            context: { reason: "checkpoint-unreadable" },
            cause: error,
          });
        }),
      ]);
      const actualRevision = revision.stdout.trim();
      if (actualRevision !== options.repositoryRevision) {
        throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda repository revision does not match lock", {
          context: { reason: "repository-revision-mismatch" },
        });
      }
      const actualCheckpointSha256 = createHash("sha256").update(checkpoint).digest("hex");
      if (actualCheckpointSha256 !== options.checkpointSha256) {
        throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda checkpoint hash does not match lock", {
          context: { reason: "checkpoint-hash-mismatch" },
        });
      }
      if (!/^Python 3\.11\./.test(`${python.stdout}\n${python.stderr}`)) {
        throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda requires the locked Python 3.11 runtime", {
          context: { reason: "python-version-mismatch" },
        });
      }
      return {
        id: "transcoda",
        version: actualRevision,
        executable: basename(options.pythonExecutable),
        modelSha256: actualCheckpointSha256,
        parameters,
        commandTemplate: [
          "scripts/inference.py",
          "--weights",
          `<${modelId}@${modelRevision}>`,
          "--image",
          "<page.png>",
          "--output",
          "<output.krn>",
        ],
        license: {
          id: "AGPL-3.0-only + CC-BY-4.0-weights",
          source: "https://github.com/btrkeks/transcoda",
        },
      };
    },

    async recognize(request) {
      await mkdir(request.outputDirectory, { recursive: true });
      const pagePrefix = join(request.outputDirectory, "page");
      const raster = await runEngineProcess(
        {
          command: pdftoppmExecutable,
          args: ["-png", "-r", String(parameters.rasterDpi), request.inputPath, pagePrefix],
          ...processOptions,
        },
        request.signal,
      );
      const pageNames = (await readdir(request.outputDirectory))
        .filter((name) => /^page-\d+\.png$/.test(name))
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
      if (pageNames.length !== 1) {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Transcoda first adapter supports exactly one PDF page", {
          context: { reason: "unsupported-page-count", pageCount: pageNames.length },
        });
      }
      const kernPath = join(request.outputDirectory, "raw-output.krn");
      const inference = await runEngineProcess(
        {
          command: options.pythonExecutable,
          cwd: options.repositoryPath,
          args: [
            "scripts/inference.py",
            "--weights",
            options.checkpointPath,
            "--image",
            join(request.outputDirectory, pageNames[0]!),
            "--output",
            kernPath,
            "--max_length",
            String(parameters.maxLength),
            "--normalize_layout",
            "True",
            "--use_grammar",
            "True",
            "--repetition_penalty",
            String(parameters.repetitionPenalty),
          ],
          ...processOptions,
        },
        request.signal,
      );
      const originalKern = await readFile(kernPath).catch((error: unknown) => {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Transcoda did not produce kern output", {
          context: { reason: "missing-kern-output" },
          cause: error,
        });
      });
      const prepared = prepareTranscodaKern(originalKern);
      const preparedPath = join(request.outputDirectory, "prepared.krn");
      await writeFile(preparedPath, prepared.bytes, { flag: "wx" });
      const musicXmlPath = join(request.outputDirectory, "converted.musicxml");
      const conversion = await runEngineProcess(
        {
          command: options.pythonExecutable,
          args: [converterScriptPath, preparedPath, musicXmlPath],
          ...processOptions,
        },
        request.signal,
      );
      const musicXmlBytes = await readFile(musicXmlPath).catch((error: unknown) => {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "kern converter did not produce MusicXML", {
          context: { reason: "invalid-musicxml-conversion" },
          cause: error,
        });
      });
      return {
        normalizationBytes: musicXmlBytes,
        nativeArtifacts: [
          { relativePath: "raw-output.krn", bytes: originalKern },
          { relativePath: "converted.musicxml", bytes: musicXmlBytes },
        ],
        diagnostics: prepared.diagnostics,
        durationMs: raster.durationMs + inference.durationMs + conversion.durationMs,
      };
    },

    normalize(recognition) {
      return normalizeTranscodaOutput(recognition.normalizationBytes, recognition.diagnostics);
    },
  };
}
