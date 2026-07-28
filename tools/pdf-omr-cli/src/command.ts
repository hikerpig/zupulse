import { pdfOmrHelpReportSchema, type PdfOmrHelpReport } from "./schemas";

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

export async function runPdfOmrCommand(args: readonly string[]): Promise<PdfOmrHelpReport> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0 || normalized[0] === "--help" || normalized[0] === "-h") {
    return pdfOmrHelpReportSchema.parse({ schemaVersion: "1.0.0", command: "help", usage });
  }
  throw new Error(`unknown command: ${normalized[0]}`);
}
