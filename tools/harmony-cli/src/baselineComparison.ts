export type AccuracyBaselineCase = {
  splits: { train: number; tune: number; eval: number };
  gold: { total: number; mapped: number; unsupported: number };
  mappingCoverage: number;
  top1Accuracy: number;
  top8OracleRecall: number;
  resolvedPrecision: number;
  resolvedCoverage: number;
  boundaryF1: number;
  expectedCalibrationError: number;
};

export type AccuracyBaselineCheck = {
  field: string;
  expected: number;
  actual: number;
  direction: "equal" | "higher" | "lower";
  tolerance: number;
  status: "passed" | "failed";
};

export function compareAccuracyBaseline(
  actual: AccuracyBaselineCase,
  expected: AccuracyBaselineCase,
  tolerance: number,
): { status: "passed" | "failed"; checks: AccuracyBaselineCheck[] } {
  const equalFields = [
    ["splits.train", expected.splits.train, actual.splits.train],
    ["splits.tune", expected.splits.tune, actual.splits.tune],
    ["splits.eval", expected.splits.eval, actual.splits.eval],
    ["gold.total", expected.gold.total, actual.gold.total],
    ["gold.mapped", expected.gold.mapped, actual.gold.mapped],
    ["gold.unsupported", expected.gold.unsupported, actual.gold.unsupported],
  ] as const;
  const higherFields = [
    ["mappingCoverage", expected.mappingCoverage, actual.mappingCoverage],
    ["top1Accuracy", expected.top1Accuracy, actual.top1Accuracy],
    ["top8OracleRecall", expected.top8OracleRecall, actual.top8OracleRecall],
    ["resolvedPrecision", expected.resolvedPrecision, actual.resolvedPrecision],
    ["resolvedCoverage", expected.resolvedCoverage, actual.resolvedCoverage],
    ["boundaryF1", expected.boundaryF1, actual.boundaryF1],
  ] as const;
  const checks: AccuracyBaselineCheck[] = [
    ...equalFields.map(([field, expectedValue, actualValue]) => ({
      field,
      expected: expectedValue,
      actual: actualValue,
      direction: "equal" as const,
      tolerance: 0,
      status: expectedValue === actualValue ? ("passed" as const) : ("failed" as const),
    })),
    ...higherFields.map(([field, expectedValue, actualValue]) => ({
      field,
      expected: expectedValue,
      actual: actualValue,
      direction: "higher" as const,
      tolerance,
      status: actualValue + tolerance >= expectedValue ? ("passed" as const) : ("failed" as const),
    })),
    {
      field: "expectedCalibrationError",
      expected: expected.expectedCalibrationError,
      actual: actual.expectedCalibrationError,
      direction: "lower",
      tolerance,
      status: actual.expectedCalibrationError <= expected.expectedCalibrationError + tolerance ? "passed" : "failed",
    },
  ];
  return { status: checks.every((check) => check.status === "passed") ? "passed" : "failed", checks };
}
