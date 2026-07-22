import { resolve } from "node:path";
import { compareBaselineFiles } from "./compareBaselineFiles";
import { evaluateHarmonyManifest } from "./evaluateManifest";
import { inspectHarmonyScore, type InspectView } from "./inspectScore";
import type { DatasetSplit } from "./evaluationProtocol";
import {
  harmonyInspectReportSchema,
  type HarmonyDatasetEvalReport,
  type HarmonyBaselineComparisonReport,
  type HarmonyEvalReport,
  type HarmonyInspectReport,
} from "./schemas";

export async function runHarmonyCommand(
  args: string[],
  context: { cwd?: string } = {},
): Promise<HarmonyInspectReport | HarmonyEvalReport | HarmonyDatasetEvalReport | HarmonyBaselineComparisonReport> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const cwd = context.cwd ?? process.env.INIT_CWD ?? process.cwd();
  if (normalized[0] === "compare") {
    const baseline = normalized[1];
    const report = normalized[2];
    if (!baseline || !report) throw new Error("usage: harmony:cli compare <baseline.json> <eval-report.json>");
    return compareBaselineFiles(resolve(cwd, baseline), resolve(cwd, report));
  }
  if (normalized[0] === "eval") {
    const path = normalized[1] ?? "test-fixtures/harmony/regressions/manifest.json";
    const dataRootIndex = normalized.indexOf("--data-root");
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseIndex = normalized.indexOf("--case");
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const splitIndex = normalized.indexOf("--split");
    const reportSplit = splitIndex < 0 ? undefined : normalized[splitIndex + 1];
    if (splitIndex >= 0 && (reportSplit === undefined || !["train", "tune", "eval"].includes(reportSplit)))
      throw new Error("--split must be train, tune, or eval");
    return evaluateHarmonyManifest(resolve(cwd, path), {
      ...(dataRoot === undefined ? {} : { dataRoot: resolve(cwd, dataRoot) }),
      ...(caseId === undefined ? {} : { caseId }),
      ...(reportSplit === undefined ? {} : { reportSplit: reportSplit as DatasetSplit }),
    });
  }
  const positional = normalized[0] === "inspect" ? normalized.slice(1) : normalized;
  const path = positional[0];
  const viewIndex = positional.indexOf("--view");
  const view = (viewIndex < 0 ? "all" : positional[viewIndex + 1]) as InspectView | undefined;
  if (!path || !view || !["all", "model", "result"].includes(view)) {
    throw new Error("usage: harmony:cli inspect <score.musicxml|score.mxl> [--view all|model|result]");
  }
  const inspected = await inspectHarmonyScore(resolve(cwd, path), view);
  return harmonyInspectReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "inspect",
    source: inspected.source,
    ...(view === "result" ? {} : { model: inspected.model }),
    ...(view === "model" ? {} : { result: inspected.result }),
  });
}
