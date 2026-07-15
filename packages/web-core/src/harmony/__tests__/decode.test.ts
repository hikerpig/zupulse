import { describe, expect, it } from "vitest";
import { decodeHarmonySequence } from "../decode";

const moment = (offsetTicks: number) => ({ measureIndex: 0, offsetTicks });
const chord = (step: "C" | "G") => ({ root: { step, alter: 0 as const }, kind: "major" as const, degrees: [] });

describe("harmony sequence decoder", () => {
  it("returns the global optimum rather than the locally best first segment", () => {
    const result = decodeHarmonySequence({
      boundaries: [moment(0), moment(1), moment(2)],
      candidates: (range) =>
        range.start.offsetTicks === 0
          ? [{ chord: chord("C"), localScore: 10, sequenceScore: 10, confidence: 0 }]
          : [{ chord: chord("G"), localScore: 8, sequenceScore: 8, confidence: 0 }],
      transition: (from, to) => (from.root.step === to.root.step ? 0 : 5),
      maxSegments: 8,
    });
    expect(result.map((segment) => segment.chord.root.step)).toEqual(["C", "G"]);
  });
});
