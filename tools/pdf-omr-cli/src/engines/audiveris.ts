import { readFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { PdfOmrError } from "../errors";
import { runEngineProcess } from "../engine-runner";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { combineProcessResourceUsage } from "../resource-metrics";
import type { OmrEngineAdapter, OmrRawRecognition } from "./types";

const commandTemplate = [
  "-batch",
  "-transcribe",
  "-export",
  "-save",
  "-output",
  "<output-dir>",
  "<input.pdf>",
] as const;

export function createAudiverisAdapter(options: {
  executable?: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}): OmrEngineAdapter {
  const executable = options.executable ?? "audiveris";
  const processOptions = {
    ...(options.environment === undefined ? {} : { env: options.environment }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };

  return {
    async inspectEnvironment(signal) {
      const result = await runEngineProcess({ command: executable, args: ["-version"], ...processOptions }, signal);
      const versionOutput = `${result.stdout}\n${result.stderr}`;
      const versionMatch =
        /(?:^|\n)-?\s*Version:\s*([^\s]+)/i.exec(versionOutput) ?? /Audiveris[ \t]+([^\s]+)/i.exec(versionOutput);
      if (versionMatch?.[1] === undefined) {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Audiveris version output is invalid", {
          context: { reason: "invalid-version-output" },
        });
      }
      return {
        id: "audiveris",
        version: versionMatch[1],
        executable: basename(executable),
        commandTemplate,
        inputKinds: ["pdf", "image"],
        license: {
          id: "AGPL-3.0-only",
          source: "https://github.com/Audiveris/audiveris/blob/master/LICENSE",
        },
      };
    },

    async recognize(request): Promise<OmrRawRecognition> {
      await mkdir(request.outputDirectory, { recursive: true });
      const result = await runEngineProcess(
        {
          command: executable,
          args: ["-batch", "-transcribe", "-export", "-save", "-output", request.outputDirectory, request.inputPath],
          ...processOptions,
        },
        request.signal,
      );
      const stem = basename(request.inputPath, extname(request.inputPath));
      try {
        const [musicXmlBytes, omrBytes] = await Promise.all([
          readFile(join(request.outputDirectory, `${stem}.mxl`)),
          readFile(join(request.outputDirectory, `${stem}.omr`)),
        ]);
        return {
          normalizationBytes: musicXmlBytes,
          nativeArtifacts: [
            { relativePath: "raw-output.mxl", bytes: musicXmlBytes },
            { relativePath: "raw-output.omr", bytes: omrBytes },
          ],
          diagnostics: [],
          durationMs: result.durationMs,
          resourceUsage: combineProcessResourceUsage([result.resourceUsage])!,
        };
      } catch (error) {
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Audiveris did not produce required artifacts", {
          context: { reason: "missing-artifact" },
          cause: error,
        });
      }
    },
    normalize(recognition) {
      return normalizeAudiverisMusicXml(recognition.normalizationBytes);
    },
  };
}
