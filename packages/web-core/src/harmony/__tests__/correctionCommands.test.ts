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
});
