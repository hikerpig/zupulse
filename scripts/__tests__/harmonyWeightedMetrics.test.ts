import { describe, expect, it } from "vitest";
import { weightedFraction } from "../harmonyWeightedMetrics";

describe("duration-weighted harmony metrics", () => {
  it("weights long annotated spans more than short events", () => {
    const events = [
      { duration: 900, correct: true },
      { duration: 100, correct: false },
    ];

    expect(
      weightedFraction(
        events,
        (event) => event.correct,
        (event) => event.duration,
      ),
    ).toBe(0.9);
  });

  it("returns zero for an empty denominator", () => {
    expect(
      weightedFraction(
        [],
        () => true,
        () => 1,
      ),
    ).toBe(0);
  });
});
