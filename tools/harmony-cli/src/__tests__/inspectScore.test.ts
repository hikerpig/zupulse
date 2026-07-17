import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectHarmonyScore } from "../inspectScore";

describe("inspectHarmonyScore", () => {
  it("uses the production MusicXML projection and harmony analysis", async () => {
    const score = fileURLToPath(new URL("../../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));
    const report = await inspectHarmonyScore(score, "all");

    expect(report.model.measures).toHaveLength(1);
    expect(report.model.tracks).toHaveLength(1);
    expect(report.result.length).toBeGreaterThan(0);
  });
});
