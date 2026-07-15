import { describe, expect, it } from "vitest";
import { effectiveHarmonyProjection } from "../effectiveProjection";
import { normalizeCorrections } from "../corrections";

const range = (start: number, end: number) => ({
  start: { measureIndex: 0, offsetTicks: start },
  end: { measureIndex: 0, offsetTicks: end },
});
const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };

describe("effective harmony projection", () => {
  it("gives corrections priority over source and revision", () => {
    const result = effectiveHarmonyProjection({
      revision: [{ status: "resolved", range: range(0, 8), chord, confidence: 0.9, alternatives: [] }],
      source: [{ type: "chord", range: range(2, 6), chord, origin: "source" }],
      corrections: normalizeCorrections([
        { id: "c", range: range(3, 5), value: { type: "no-chord" }, updatedAt: "2026-07-15T00:00:00.000Z" },
      ]),
    });
    expect(
      result.map((entry) => `${entry.range.start.offsetTicks}-${entry.range.end.offsetTicks}:${entry.type}`),
    ).toEqual(["0-2:chord", "2-3:chord", "3-5:no-chord", "5-6:chord", "6-8:chord"]);
    expect(result[2]?.origin).toBe("correction");
  });

  it("keeps unresolved and source conflict distinct", () => {
    const result = effectiveHarmonyProjection({
      revision: [{ status: "unresolved", range: range(0, 4), reason: "low-confidence", alternatives: [] }],
      source: [{ type: "unresolved", range: range(4, 8), reason: "source-conflict", alternatives: [] }],
      corrections: [],
    });
    expect(result.map((entry) => entry.type)).toEqual(["unresolved", "unresolved"]);
    expect(result[0]?.reason).toBe("low-confidence");
    expect(result[1]?.reason).toBe("source-conflict");
  });
});
