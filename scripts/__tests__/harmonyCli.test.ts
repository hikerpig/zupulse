import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeHarmonyFile, runHarmonyCli } from "../harmonyCli";

describe("harmony CLI", () => {
  it("projects an MXL into the internal model and final result", async () => {
    const report = await analyzeHarmonyFile(resolve("test-fixtures/musicxml/generated/simple.mxl"));

    expect(report.model.schemaVersion).toBe("1.0.0");
    expect(report.model.measures).toHaveLength(1);
    expect(report.model.tracks).toHaveLength(1);
    expect(report.result.length).toBeGreaterThan(0);
  });

  it("selects model and result views", async () => {
    const path = resolve("test-fixtures/musicxml/generated/simple.mxl");

    expect(await runHarmonyCli([path, "--view", "model"])).toMatchObject({ schemaVersion: "1.0.0" });
    expect(await runHarmonyCli([path, "--view", "result"])).toEqual(expect.any(Array));
  });

  it("keeps the Turkish March projection and analysis reproducible", async () => {
    const report = await analyzeHarmonyFile(resolve("test-fixtures/musicxml/rondo-alla-turca-turkish-march.mxl"));

    expect(report.model).toMatchObject({
      schemaVersion: "1.0.0",
      ticksPerQuarter: 960,
      sourceHarmony: [],
    });
    expect(report.model.measures).toHaveLength(147);
    expect(report.model.tracks).toHaveLength(1);
    expect(report.model.tracks[0]?.staves).toHaveLength(2);
    expect(report.model.tracks[0]?.staves.flatMap((staff) => staff.notes)).toHaveLength(1_736);
    expect(report.result).toHaveLength(365);
    expect(report.result.filter((segment) => segment.status === "resolved")).toHaveLength(305);
    expect(report.result[0]).toMatchObject({
      status: "resolved",
      chord: { root: { step: "A", alter: 0 }, kind: "suspended-second", degrees: [] },
    });
  });
});
