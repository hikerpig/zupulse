import { describe, expect, it } from "vitest";
import { scoreHarmonyTransition } from "../transitions";

const chord = (step: "C" | "D" | "F" | "G", kind: "major" | "minor" = "major") => ({
  root: { step, alter: 0 as const },
  kind,
  degrees: [],
});

describe("harmony transition prior", () => {
  it("prefers continuation and fifth motion over an unrelated jump", () => {
    const same = scoreHarmonyTransition(chord("C"), chord("C"));
    const fifth = scoreHarmonyTransition(chord("D", "minor"), chord("G"));
    const unrelated = scoreHarmonyTransition(chord("C"), chord("D"));

    expect(same).toBeGreaterThan(fifth);
    expect(fifth).toBeGreaterThan(unrelated);
  });

  it("keeps transition magnitudes weak enough to only break local ties", () => {
    expect(Math.abs(scoreHarmonyTransition(chord("C"), chord("G")))).toBeLessThanOrEqual(0.25);
  });
});
