import { resolve } from "node:path";
import { PdfOmrError } from "./errors";
import { createEngineRegistry, type EngineRegistry } from "./engine-registry";
import { resolveFullPageSegmentation, type StaffLayout } from "./staff-system-segmentation";
import type { RunBenchmarkDependencies } from "./benchmark/run-benchmark";
import type { FusionReport } from "./fusion/schemas";
import type { ApplyFusionReport } from "./fusion/writeback-schemas";
import type { MidiRebuildReport } from "./fusion/midi-rebuild-schemas";
import type { MidiImportReport } from "./midi/schemas";
import {
  type PdfOmrBenchmarkReport,
  type PdfOmrCompareEnginesReport,
  type PdfOmrEvaluateRepairCandidatesReport,
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
  "  import-midi <input.mid> --output <run-dir>",
  "  fuse --musicxml <score.musicxml|score.mxl> --midi <score-export.mid> --output <run-dir>",
  "  apply-fusion --run <fusion-run-dir> --decisions <decisions.json> --output <run-dir>",
  "  rebuild-from-midi --musicxml <score.musicxml|score.mxl> --midi <score-export.mid> --musescore <executable> --output <run-dir>",
  "  recognize <input.pdf> --engine <audiveris|legato|rokot> --output <run-dir> [--input-scope <full-page|system-crop>] [--staff-layout <auto|single-staff|grand-staff|three-staff>] [--segmentation piano-grand-staff-v1]",
  "  validate <draft.json> --output <diagnostics.json>",
  "  analyze <draft.json> --output <harmony.json>",
  "  export-musicxml <draft.json> --output <score.mxl>",
  "  benchmark --manifest <manifest.json> --engine <audiveris|legato|rokot> --output <result-dir>",
  "  compare-engines --primary <benchmark-run-dir> --secondary <benchmark-run-dir> --output <comparison-run-dir> [--topology <strict|ordered-staves>]",
  "  evaluate-repair-candidates --comparison <comparison-run-dir> --primary <benchmark-run-dir> --output <evaluation-run-dir>",
].join("\n");

export async function runPdfOmrCommand(
  args: readonly string[],
  context: {
    cwd?: string;
    engineRegistry?: EngineRegistry;
    signal?: AbortSignal;
    benchmarkDependencies?: RunBenchmarkDependencies;
  } = {},
): Promise<
  | PdfOmrHelpReport
  | PdfOmrInspectReport
  | PdfOmrRecognizeReport
  | PdfOmrAnalyzeReport
  | PdfOmrValidateReport
  | PdfOmrExportReport
  | PdfOmrBenchmarkReport
  | PdfOmrCompareEnginesReport
  | PdfOmrEvaluateRepairCandidatesReport
  | MidiImportReport
  | FusionReport
  | ApplyFusionReport
  | MidiRebuildReport
> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0 || normalized[0] === "--help" || normalized[0] === "-h") {
    return pdfOmrHelpReportSchema.parse({ schemaVersion: "1.0.0", command: "help", usage });
  }
  if (normalized[0] === "import-midi") {
    const input = normalized[1];
    const outputFlag = normalized[2];
    const output = normalized[3];
    if (input === undefined || outputFlag !== "--output" || output === undefined || normalized.length !== 4) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "import-midi requires <input.mid> --output <run-dir>", {
        context: { command: "import-midi" },
      });
    }
    const { importMidiCommand } = await import("./commands/import-midi");
    return importMidiCommand(input, output, context.cwd ?? process.cwd());
  }
  if (normalized[0] === "fuse") {
    const flags = parseFlags(
      normalized.slice(1),
      new Set(["--musicxml", "--midi", "--output", "--midi-kind", "--repair-mode"]),
    );
    const musicXml = flags.get("--musicxml");
    const midi = flags.get("--midi");
    const output = flags.get("--output");
    const midiKind = flags.get("--midi-kind") ?? "score-export";
    const repairMode = flags.get("--repair-mode") ?? "report-only";
    if (
      musicXml === undefined ||
      midi === undefined ||
      output === undefined ||
      midiKind !== "score-export" ||
      repairMode !== "report-only"
    ) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "fuse requires --musicxml <score> --midi <score-export.mid> --output <run-dir> and supports only score-export/report-only",
        { context: { command: "fuse" } },
      );
    }
    const { fuseCommand } = await import("./commands/fuse");
    return fuseCommand({
      musicXml,
      midi,
      output,
      midiKind,
      repairMode,
      cwd: context.cwd ?? process.cwd(),
    });
  }
  if (normalized[0] === "apply-fusion") {
    const flags = parseFlags(normalized.slice(1), new Set(["--run", "--decisions", "--output"]));
    const run = flags.get("--run");
    const decisions = flags.get("--decisions");
    const output = flags.get("--output");
    if (run === undefined || decisions === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "apply-fusion requires --run <fusion-run-dir> --decisions <decisions.json> --output <run-dir>",
        { context: { command: "apply-fusion" } },
      );
    }
    const { applyFusionCommand } = await import("./commands/apply-fusion");
    return applyFusionCommand({ run, decisions, output, cwd: context.cwd ?? process.cwd() });
  }
  if (normalized[0] === "rebuild-from-midi") {
    const flags = parseFlags(normalized.slice(1), new Set(["--musicxml", "--midi", "--musescore", "--output"]));
    const musicXml = flags.get("--musicxml");
    const midi = flags.get("--midi");
    const museScore = flags.get("--musescore");
    const output = flags.get("--output");
    if (musicXml === undefined || midi === undefined || museScore === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "rebuild-from-midi requires --musicxml <score> --midi <score-export.mid> --musescore <executable> --output <run-dir>",
        { context: { command: "rebuild-from-midi" } },
      );
    }
    const { rebuildFromMidiCommand } = await import("./commands/rebuild-from-midi");
    return rebuildFromMidiCommand({
      musicXml,
      midi,
      museScore,
      output,
      cwd: context.cwd ?? process.cwd(),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
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
    const flags = parseFlags(
      normalized.slice(2),
      new Set(["--engine", "--output", "--input-scope", "--staff-layout", "--segmentation"]),
    );
    const engineId = flags.get("--engine");
    const output = flags.get("--output");
    const inputScope = flags.get("--input-scope");
    const staffLayout = flags.get("--staff-layout");
    const segmentationId = flags.get("--segmentation");
    if (input === undefined || engineId === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "recognize requires <input.pdf> --engine <engine-id> --output <run-dir> [--staff-layout <layout>] [--segmentation piano-grand-staff-v1]",
        { context: { command: "recognize" } },
      );
    }
    if (staffLayout !== undefined && !["auto", "single-staff", "grand-staff", "three-staff"].includes(staffLayout)) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown staff layout", {
        context: { command: "recognize", staffLayout },
      });
    }
    if (staffLayout !== undefined && engineId !== "rokot") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "staff layout is supported only by Rokot", {
        context: { command: "recognize", engineId },
      });
    }
    if (inputScope !== undefined && !["full-page", "system-crop"].includes(inputScope)) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown input scope", {
        context: { command: "recognize", inputScope },
      });
    }
    if (inputScope !== undefined && engineId !== "rokot") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "input scope is supported only by Rokot", {
        context: { command: "recognize", engineId },
      });
    }
    if (segmentationId !== undefined && engineId !== "rokot") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "segmentation identity is supported only by Rokot", {
        context: { command: "recognize", engineId },
      });
    }
    if (segmentationId !== undefined && inputScope === "system-crop") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "segmentation identity is full-page only", {
        context: { command: "recognize", inputScope, segmentationId },
      });
    }
    if (segmentationId !== undefined) {
      resolveFullPageSegmentation({
        segmentationId,
        ...(staffLayout === undefined ? {} : { staffLayout: staffLayout as StaffLayout }),
      });
    }
    const { recognizeCommand } = await import("./commands/recognize");
    return recognizeCommand(input, engineId, output, {
      cwd: context.cwd ?? process.cwd(),
      engineRegistry: context.engineRegistry ?? createEngineRegistry(),
      ...(inputScope === undefined ? {} : { inputScope: inputScope as "full-page" | "system-crop" }),
      ...(staffLayout === undefined
        ? {}
        : { staffLayout: staffLayout as "auto" | "single-staff" | "grand-staff" | "three-staff" }),
      ...(segmentationId === undefined ? {} : { segmentationId }),
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
  if (normalized[0] === "benchmark") {
    const benchmarkArgs = normalized[1] === "--" ? normalized.slice(2) : normalized.slice(1);
    const flags = parseBenchmarkFlags(benchmarkArgs);
    const manifest = flags.get("--manifest");
    const engineId = flags.get("--engine");
    const output = flags.get("--output");
    if (manifest === undefined || engineId === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "benchmark requires --manifest <manifest.json> --engine <engine-id> --output <result-dir>",
        { context: { command: "benchmark" } },
      );
    }
    const mode = flags.get("--mode") ?? "development";
    if (mode !== "development" && mode !== "holdout") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "benchmark mode must be development or holdout");
    }
    const protocolSha256 = flags.get("--protocol-sha");
    const { benchmarkCommand } = await import("./commands/benchmark");
    const cwd = context.cwd ?? process.cwd();
    return benchmarkCommand(
      resolve(cwd, manifest),
      engineId,
      resolve(cwd, output),
      {
        mode,
        preprocess: flags.get("--preprocess") ?? "none",
        ...(protocolSha256 === undefined ? {} : { protocolSha256 }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      },
      context.benchmarkDependencies ?? {},
    );
  }
  if (normalized[0] === "compare-engines") {
    const flags = parseFlags(normalized.slice(1), new Set(["--primary", "--secondary", "--output", "--topology"]));
    const primaryDirectory = flags.get("--primary");
    const secondaryDirectory = flags.get("--secondary");
    const output = flags.get("--output");
    if (primaryDirectory === undefined || secondaryDirectory === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "compare-engines requires --primary <run> --secondary <run> --output <comparison-run-dir>",
        { context: { command: "compare-engines" } },
      );
    }
    const topologyMode = flags.get("--topology") ?? "strict";
    if (topologyMode !== "strict" && topologyMode !== "ordered-staves") {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "compare-engines topology mode is invalid", {
        context: { command: "compare-engines", topologyMode },
      });
    }
    const { compareEnginesCommand } = await import("./commands/compare-engines");
    return compareEnginesCommand({
      primaryDirectory,
      secondaryDirectory,
      output,
      topologyMode,
      cwd: context.cwd ?? process.cwd(),
    });
  }
  if (normalized[0] === "evaluate-repair-candidates") {
    const flags = parseFlags(normalized.slice(1), new Set(["--comparison", "--primary", "--output"]));
    const comparisonDirectory = flags.get("--comparison");
    const primaryDirectory = flags.get("--primary");
    const output = flags.get("--output");
    if (comparisonDirectory === undefined || primaryDirectory === undefined || output === undefined) {
      throw new PdfOmrError(
        "INVALID_CLI_ARGUMENT",
        "evaluate-repair-candidates requires --comparison <run> --primary <run> --output <evaluation-run-dir>",
        { context: { command: "evaluate-repair-candidates" } },
      );
    }
    const { evaluateRepairCandidatesCommand } = await import("./commands/evaluate-repair-candidates");
    return evaluateRepairCandidatesCommand({
      comparisonDirectory,
      primaryDirectory,
      output,
      cwd: context.cwd ?? process.cwd(),
    });
  }
  throw new PdfOmrError("INVALID_CLI_ARGUMENT", `unknown command: ${normalized[0]}`, {
    context: { command: normalized[0] },
  });
}

function parseBenchmarkFlags(args: readonly string[]): Map<string, string> {
  const allowed = new Set(["--manifest", "--engine", "--output", "--preprocess", "--mode", "--protocol-sha"]);
  return parseFlags(args, allowed);
}

function parseFlags(args: readonly string[], allowed: ReadonlySet<string>): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || value === undefined || !allowed.has(flag) || result.has(flag)) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "invalid benchmark arguments", {
        context: { flag },
      });
    }
    result.set(flag, value);
  }
  return result;
}
