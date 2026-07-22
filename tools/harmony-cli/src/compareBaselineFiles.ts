import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { compareAccuracyBaseline } from "./baselineComparison";
import {
  harmonyAccuracyBaselineSchema,
  harmonyBaselineComparisonReportSchema,
  harmonyDatasetEvalReportSchema,
  type HarmonyBaselineComparisonReport,
} from "./schemas";

export async function compareBaselineFiles(
  baselinePath: string,
  reportPath: string,
): Promise<HarmonyBaselineComparisonReport> {
  const baseline = harmonyAccuracyBaselineSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
  const report = harmonyDatasetEvalReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
  const accuracyCases = new Map(
    report.cases.filter((item) => item.kind === "accuracy-corpus").map((item) => [item.id, item]),
  );
  const cases = Object.entries(baseline.cases).map(([id, expected]) => {
    const actual = accuracyCases.get(id);
    if (!actual) throw new Error(`report is missing baseline case: ${id}`);
    if (actual.reportSplit !== "eval") throw new Error(`baseline comparison requires eval report: ${id}`);
    const compared = compareAccuracyBaseline(
      { splits: actual.splits, ...actual.metrics },
      expected,
      baseline.tolerance,
    );
    return { id, ...compared };
  });
  return harmonyBaselineComparisonReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "compare",
    baseline: basename(baselinePath),
    report: basename(reportPath),
    summary: {
      passed: cases.filter((item) => item.status === "passed").length,
      failed: cases.filter((item) => item.status === "failed").length,
    },
    cases,
  });
}
