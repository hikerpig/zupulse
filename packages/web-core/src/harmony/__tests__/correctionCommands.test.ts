import { describe, expect, it } from "vitest";
import { applyCorrectionCommand } from "../correctionCommands";

const base = {
  id: "c",
  range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
  value: { type: "no-chord" as const },
  updatedAt: "2026-07-15T00:00:00.000Z",
};
describe("correction commands", () => {
  it("splits and resets corrections deterministically", () => {
    const split = applyCorrectionCommand([base], { type: "split", id: "c", at: { measureIndex: 0, offsetTicks: 2 } });
    expect(split.map((item) => item.range.end.offsetTicks)).toEqual([2, 4]);
    expect(
      applyCorrectionCommand(split, {
        type: "reset",
        range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 0, offsetTicks: 3 } },
      }),
    ).toHaveLength(2);
  });

  it("merges adjacent corrections only when their values match", () => {
    const right = {
      ...base,
      id: "d",
      range: { start: { measureIndex: 0, offsetTicks: 4 }, end: { measureIndex: 0, offsetTicks: 8 } },
    };
    const merged = applyCorrectionCommand([base, right], { type: "merge", leftId: "c", rightId: "d" });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.range).toEqual({
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 8 },
    });
    const different = applyCorrectionCommand(
      [
        base,
        { ...right, value: { type: "chord", chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } } },
      ],
      { type: "merge", leftId: "c", rightId: "d" },
    );
    expect(different).toHaveLength(2);
  });

  it("moves a correction while preserving its value and id", () => {
    const moved = applyCorrectionCommand([base], {
      type: "move",
      id: "c",
      start: { measureIndex: 0, offsetTicks: 1 },
      end: { measureIndex: 0, offsetTicks: 5 },
    });
    expect(moved[0]).toMatchObject({ id: "c", range: { start: { offsetTicks: 1 }, end: { offsetTicks: 5 } } });
  });
});
