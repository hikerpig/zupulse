import { describe, expect, it } from "vitest";
import { normalizeCorrections } from "../corrections";

const range = (start: number, end: number) => ({
  start: { measureIndex: 0, offsetTicks: start },
  end: { measureIndex: 0, offsetTicks: end },
});
const correction = (id: string, start: number, end: number) => ({
  id,
  range: range(start, end),
  value: { type: "no-chord" as const },
  updatedAt: "2026-07-15T00:00:00.000Z",
});

describe("harmony correction ranges", () => {
  it("splits the old correction around a later overlapping edit", () => {
    expect(normalizeCorrections([correction("old", 0, 10), correction("new", 4, 6)])).toEqual([
      correction("old", 0, 4),
      correction("new", 4, 6),
      correction("old", 6, 10),
    ]);
  });

  it("removes a correction when reset is applied", () => {
    expect(normalizeCorrections([correction("old", 0, 10)], range(3, 7))).toEqual([
      correction("old", 0, 3),
      correction("old", 7, 10),
    ]);
  });
});
