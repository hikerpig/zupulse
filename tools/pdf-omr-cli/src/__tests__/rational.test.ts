import { describe, expect, it } from "vitest";
import { addRational, compareRational, normalizeRational, safeLcm } from "../rational";

describe("exact rational arithmetic", () => {
  it("normalizes signs and common factors", () => {
    expect(normalizeRational({ numerator: -6, denominator: -8 })).toEqual({
      numerator: 3,
      denominator: 4,
    });
    expect(normalizeRational({ numerator: 0, denominator: 9 })).toEqual({
      numerator: 0,
      denominator: 1,
    });
  });

  it("adds and compares without floating point approximation", () => {
    expect(addRational({ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 6 })).toEqual({
      numerator: 1,
      denominator: 2,
    });
    expect(compareRational({ numerator: 2, denominator: 6 }, { numerator: 1, denominator: 3 })).toBe(0);
    expect(compareRational({ numerator: 7, denominator: 8 }, { numerator: 3, denominator: 4 })).toBe(1);
  });

  it("rejects unsafe inputs and LCM overflow", () => {
    expect(() => normalizeRational({ numerator: 1, denominator: 0 })).toThrow(
      expect.objectContaining({ code: "DRAFT_VALIDATION_FAILED" }),
    );
    expect(() => safeLcm(4_000_000_007, 4_000_000_009)).toThrow(
      expect.objectContaining({ code: "DRAFT_VALIDATION_FAILED" }),
    );
  });
});
