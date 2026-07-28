import { PdfOmrError } from "./errors";
import { pdfOmrHelpReportSchema, type PdfOmrHelpReport, type PdfOmrInspectReport } from "./schemas";

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
  context: { cwd?: string } = {},
): Promise<PdfOmrHelpReport | PdfOmrInspectReport> {
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
  throw new PdfOmrError("INVALID_CLI_ARGUMENT", `unknown command: ${normalized[0]}`, {
    context: { command: normalized[0] },
  });
}
