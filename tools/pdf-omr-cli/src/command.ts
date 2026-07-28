import { PdfOmrError } from "./errors";
import { createEngineRegistry, type EngineRegistry } from "./engine-registry";
import {
  pdfOmrHelpReportSchema,
  type PdfOmrAnalyzeReport,
  type PdfOmrExportReport,
  type PdfOmrHelpReport,
  type PdfOmrInspectReport,
  type PdfOmrRecognizeReport,
  type PdfOmrValidateReport,
} from "./schemas";

const usage = [
  "pdf-omr <command>",
  "",
  "Commands:",
  "  inspect <input.pdf> --output <run-dir>",
  "  recognize <input.pdf> --engine <engine-id> --output <run-dir>",
  "  validate <draft.json> --output <diagnostics.json>",
  "  analyze <draft.json> --output <harmony.json>",
  "  export-musicxml <draft.json> --output <score.mxl>",
  "  benchmark --manifest <manifest.json> --engine <engine-id> --output <result-dir>",
].join("\n");

export async function runPdfOmrCommand(
  args: readonly string[],
  context: { cwd?: string; engineRegistry?: EngineRegistry; signal?: AbortSignal } = {},
): Promise<
  | PdfOmrHelpReport
  | PdfOmrInspectReport
  | PdfOmrRecognizeReport
  | PdfOmrAnalyzeReport
  | PdfOmrValidateReport
  | PdfOmrExportReport
> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0 || normalized[0] === "--help" || normalized[0] === "-h") {
    return pdfOmrHelpReportSchema.parse({ schemaVersion: "1.0.0", command: "help", usage });
  }
  if (normalized[0] === "inspect") {
    const input = normalized[1];
    const outputFlag = normalized[2];
    const output = normalized[3];
    if (input === undefined || outputFlag !== "--output" || output === undefined || normalized.length !== 4) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "inspect requires <input.pdf> --output <run-dir>", {
        context: { command: "inspect" },
      });
    }
    const { inspectCommand } = await import("./commands/inspect");
    return inspectCommand(input, output, context.cwd ?? process.cwd());
  }
  if (normalized[0] === "recognize") {
    const input = normalized[1];
    const engineFlag = normalized[2];
    const engineId = normalized[3];
    const outputFlag = normalized[4];
    const output = normalized[5];
    if (
      input === undefined ||
      engineFlag !== "--engine" ||
      engineId === undefined ||
      outputFlag !== "--output" ||
      output === undefined ||
      normalized.length !== 6
    ) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "recognize requires <input.pdf> --engine <engine-id> --output <run-dir>",
        { context: { command: "recognize" } },
      );
    }
    const { recognizeCommand } = await import("./commands/recognize");
    return recognizeCommand(input, engineId, output, {
      cwd: context.cwd ?? process.cwd(),
      engineRegistry: context.engineRegistry ?? createEngineRegistry(),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
  }
  if (normalized[0] === "analyze") {
    const input = normalized[1];
    const outputFlag = normalized[2];
    const output = normalized[3];
    const thresholdFlag = normalized[4];
    const thresholdValue = normalized[5];
    if (
      input === undefined ||
      outputFlag !== "--output" ||
      output === undefined ||
      normalized.length > 6 ||
      (normalized.length > 4 && (thresholdFlag !== "--decision-threshold" || thresholdValue === undefined))
    ) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "analyze requires <draft.json> --output <harmony.json> [--decision-threshold <0..1>]",
        { context: { command: "analyze" } },
      );
    }
    const decisionThreshold = thresholdValue === undefined ? 0.6 : Number(thresholdValue);
    if (!Number.isFinite(decisionThreshold) || decisionThreshold < 0 || decisionThreshold > 1) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "decision threshold must be between 0 and 1", {
        context: { decisionThreshold: thresholdValue },
      });
    }
    const { analyzeCommand } = await import("./commands/analyze");
    return analyzeCommand(input, output, decisionThreshold, context.cwd ?? process.cwd());
  }
  if (normalized[0] === "validate") {
    const input = normalized[1];
    const outputFlag = normalized[2];
    const output = normalized[3];
    if (input === undefined || outputFlag !== "--output" || output === undefined || normalized.length !== 4) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "validate requires <draft.json> --output <diagnostics.json>", {
        context: { command: "validate" },
      });
    }
    const { validateCommand } = await import("./commands/validate");
    return validateCommand(input, output, context.cwd ?? process.cwd());
  }
  if (normalized[0] === "export-musicxml") {
    const input = normalized[1];
    const outputFlag = normalized[2];
    const output = normalized[3];
    const roundTripFlag = normalized[4];
    const roundTripOutput = normalized[5];
    if (
      input === undefined ||
      outputFlag !== "--output" ||
      output === undefined ||
      normalized.length > 6 ||
      (normalized.length > 4 && (roundTripFlag !== "--round-trip-report" || roundTripOutput === undefined))
    ) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "export-musicxml requires <draft.json> --output <score.mxl> [--round-trip-report <report.json>]",
        { context: { command: "export-musicxml" } },
      );
    }
    const { exportMusicXmlCommand } = await import("./commands/export-musicxml");
    return exportMusicXmlCommand(input, output, roundTripOutput, context.cwd ?? process.cwd());
  }
  throw new PdfOmrError("INVALID_CLI_ARGUMENT", `unknown command: ${normalized[0]}`, {
    context: { command: normalized[0] },
  });
}
