import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { PdfOmrError } from "../errors";
import { runEngineProcess } from "../engine-runner";
import { findBlankPdfPages } from "../inspect-pdf";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { combineProcessResourceUsage } from "../resource-metrics";
import type { OmrScoreDraft } from "../schemas";
import type { OmrEngineAdapter, OmrRawRecognition, OmrRecognitionRequest } from "./types";

const commandTemplate = [
  "-batch",
  "-transcribe",
  "-export",
  "-save",
  "-output",
  "<output-dir>",
  "<input.pdf>",
] as const;

function classifyAudiverisFailure(output: { stdout: string; stderr: string }): PdfOmrError | undefined {
  const log = `${output.stdout}\n${output.stderr}`;
  if (/Too large image/.test(log)) {
    return new PdfOmrError("INVALID_INPUT", "Audiveris rejected the oversized sheet image", {
      context: { reason: "input-image-too-large" },
    });
  }
  if (/Timeout \d+ seconds for step/.test(log)) {
    return new PdfOmrError("ENGINE_EXECUTION_FAILED", "Audiveris exceeded its per-step time limit", {
      context: { reason: "engine-step-timeout" },
    });
  }
  return undefined;
}

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
      const filtered = await filterBlankPdfPages(request);
      const diagnostics: OmrScoreDraft["diagnostics"] =
        filtered.skippedPages.length === 0
          ? []
          : [
              {
                code: "AUDIVERIS_BLANK_PAGES_SKIPPED",
                severity: "warning",
                message: `Blank PDF pages were removed before recognition: ${filtered.skippedPages
                  .map((pageIndex) => pageIndex + 1)
                  .join(", ")}`,
              },
            ];
      const result = await runEngineProcess(
        {
          command: executable,
          args: ["-batch", "-transcribe", "-export", "-save", "-output", request.outputDirectory, filtered.inputPath],
          classifyFailure: classifyAudiverisFailure,
          ...processOptions,
        },
        request.signal,
      );
      const stem = basename(filtered.inputPath, extname(filtered.inputPath));
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
          diagnostics,
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
      const draft = normalizeAudiverisMusicXml(recognition.normalizationBytes);
      if (recognition.diagnostics.length === 0) return draft;
      return { ...draft, diagnostics: [...recognition.diagnostics, ...draft.diagnostics] };
    },
  };
}

// Audiveris aborts the whole book when a sheet has no staff lines, so blank
// pages must be removed before invoking it. Unparseable inputs pass through
// unchanged and keep the engine's own failure behavior.
async function filterBlankPdfPages(
  request: OmrRecognitionRequest,
): Promise<{ inputPath: string; skippedPages: number[] }> {
  const passthrough = { inputPath: request.inputPath, skippedPages: [] as number[] };
  if (extname(request.inputPath).toLowerCase() !== ".pdf") return passthrough;
  const bytes = await readFile(request.inputPath);
  let blankPages: number[];
  try {
    blankPages = await findBlankPdfPages(bytes, {
      fileName: basename(request.inputPath),
      ...(request.standardFontDirectory === undefined ? {} : { standardFontDirectory: request.standardFontDirectory }),
      ...(request.wasmDirectory === undefined ? {} : { wasmDirectory: request.wasmDirectory }),
    });
  } catch {
    return passthrough;
  }
  if (blankPages.length === 0) return passthrough;
  const source = await PDFDocument.load(bytes).catch(() => undefined);
  if (source === undefined || blankPages.length >= source.getPageCount()) return passthrough;
  const kept = await PDFDocument.create();
  const keptIndexes = source.getPageIndices().filter((pageIndex) => !blankPages.includes(pageIndex));
  for (const page of await kept.copyPages(source, keptIndexes)) kept.addPage(page);
  const filteredPath = join(request.outputDirectory, "filtered-input.pdf");
  await writeFile(filteredPath, await kept.save(), { flag: "wx" });
  return { inputPath: filteredPath, skippedPages: blankPages };
}
