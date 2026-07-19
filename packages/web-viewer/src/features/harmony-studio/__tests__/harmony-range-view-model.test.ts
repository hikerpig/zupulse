import { describe, expect, it } from "vitest";
import type { EffectiveHarmonyEntry, HarmonySegment } from "@zupulse/web-core";
import {
  createHarmonyRangeViewItems,
  filterHarmonyRangeViewItems,
  formatHarmonyRange,
  restoreHarmonySelection,
  selectContainingHarmonyRange,
} from "../harmony-range-view-model";

const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const range = (start: number, end: number) => ({
  start: { measureIndex: 0, offsetTicks: start },
  end: { measureIndex: 0, offsetTicks: end },
});

describe("createHarmonyRangeViewItems", () => {
  it("keeps the effective result separate from the overlapping analysis result", () => {
    const effective: EffectiveHarmonyEntry[] = [
      { type: "chord", range: range(0, 4), chord, origin: "correction" },
      { type: "no-chord", range: range(4, 8), origin: "source" },
      { type: "chord", range: range(8, 12), chord, origin: "analysis" },
      { type: "unresolved", range: range(12, 16), reason: "low-confidence", alternatives: [], origin: "analysis" },
    ];
    const revision: HarmonySegment[] = [
      { status: "resolved", range: range(0, 8), chord, confidence: 0.82, alternatives: [] },
      { status: "resolved", range: range(8, 12), chord, confidence: 0.93, alternatives: [] },
      { status: "unresolved", range: range(12, 16), reason: "low-confidence", alternatives: [] },
    ];

    expect(createHarmonyRangeViewItems(effective, revision)).toEqual([
      {
        key: "0:0-0:4",
        effective: effective[0],
        origin: "correction",
        analysis: revision[0],
        confidence: "high",
      },
      {
        key: "0:4-0:8",
        effective: effective[1],
        origin: "source",
        analysis: revision[0],
        confidence: "high",
      },
      {
        key: "0:8-0:12",
        effective: effective[2],
        origin: "analysis",
        analysis: revision[1],
        confidence: "high",
      },
      {
        key: "0:12-0:16",
        effective: effective[3],
        origin: "analysis",
        analysis: revision[2],
      },
    ]);
  });

  it("formats ranges, filters items, and distinguishes direct selection from restored selection", () => {
    const effective: EffectiveHarmonyEntry[] = [
      { type: "chord", range: range(0, 4), chord, origin: "correction" },
      { type: "unresolved", range: range(8, 12), reason: "low-confidence", alternatives: [], origin: "analysis" },
      { type: "chord", range: range(12, 16), chord, origin: "analysis" },
    ];
    const items = createHarmonyRangeViewItems(effective, []);
    const measures = [{ durationTicks: 16, timeSignature: { numerator: 4, denominator: 4 } }];

    expect(formatHarmonyRange(range(2, 6), measures)).toBe("第 1 小节 · 第 1.5–2.5 拍");
    expect(filterHarmonyRangeViewItems(items, "corrected")).toEqual([items[0]]);
    expect(filterHarmonyRangeViewItems(items, "corrected", items[1]!.key)).toEqual([items[0], items[1]]);
    expect(filterHarmonyRangeViewItems(items, "unresolved")).toEqual([items[1]]);
    expect(selectContainingHarmonyRange(items, { measureIndex: 0, offsetTicks: 6 })).toBeUndefined();
    expect(restoreHarmonySelection(items, { measureIndex: 0, offsetTicks: 6 })).toEqual({
      focus: { measureIndex: 0, offsetTicks: 6 },
      range: range(8, 12),
    });
  });
});
