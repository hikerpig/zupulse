import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareRegressionSummary, evaluateHarmonyManifest } from "../evaluateManifest";

describe("evaluateHarmonyManifest", () => {
  it("evaluates the Turkish March structural regression from its manifest", async () => {
    const manifest = fileURLToPath(
      new URL("../../../../test-fixtures/harmony/regressions/manifest.json", import.meta.url),
    );

    const report = await evaluateHarmonyManifest(manifest);

    expect(report).toMatchObject({
      schemaVersion: "1.0.0",
      command: "eval",
      manifest: "harmony-regressions-v1",
      summary: { passed: 1, failed: 0 },
      cases: [{ id: "turkish-march-structure", status: "passed" }],
    });
    expect(report.cases[0]?.checks.every((check) => check.status === "passed")).toBe(true);
  });

  it("reports reviewable field differences", () => {
    const checks = compareRegressionSummary(
      {
        sha256: "actual",
        model: { measures: 147, tracks: 1, staves: 2, notes: 1_736 },
        result: { segments: 365, resolved: 305, unresolved: 60 },
      },
      {
        sha256: "expected",
        model: { measures: 147, tracks: 1, staves: 2, notes: 1_700 },
        result: { segments: 365, resolved: 305, unresolved: 60 },
      },
    );

    expect(checks.filter((check) => check.status === "failed")).toEqual([
      { field: "sha256", expected: "expected", actual: "actual", status: "failed" },
      { field: "model.notes", expected: 1_700, actual: 1_736, status: "failed" },
    ]);
  });
});
