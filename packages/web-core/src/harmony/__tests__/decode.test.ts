import { describe, expect, it } from "vitest";
import { decodeHarmonySequence } from "../decode";

const moment = (offsetTicks: number) => ({ measureIndex: 0, offsetTicks });
const chord = (step: "C" | "D" | "G") => ({
  root: { step, alter: 0 as const },
  kind: "major" as const,
  degrees: [],
});

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
      maxSpan: 1,
    });
    expect(result.map((segment) => segment.chord.root.step)).toEqual(["C", "G"]);
  });

  it("offers exact Viterbi when a narrow beam drops the globally optimal chord state", () => {
    const candidates = (range: { start: { offsetTicks: number }; end: { offsetTicks: number } }) => {
      if (range.start.offsetTicks === 0 && range.end.offsetTicks === 1)
        return [
          { chord: chord("C"), localScore: 10, sequenceScore: 10, confidence: 0 },
          { chord: chord("G"), localScore: 9, sequenceScore: 9, confidence: 0 },
        ];
      return [{ chord: chord("D"), localScore: 0, sequenceScore: 0, confidence: 0 }];
    };
    const transition = (from: ReturnType<typeof chord>, to: ReturnType<typeof chord>) =>
      from.root.step === "G" && to.root.step === "D" ? 100 : 0;
    const beam = decodeHarmonySequence({
      boundaries: [moment(0), moment(1), moment(2)],
      candidates,
      transition,
      beamWidth: 1,
      maxSpan: 1,
    });
    const exact = decodeHarmonySequence({
      boundaries: [moment(0), moment(1), moment(2)],
      candidates,
      transition,
      searchMode: "exact",
      maxSpan: 1,
    });

    expect(beam.map((segment) => segment.chord.root.step)).toEqual(["C", "D"]);
    expect(exact.map((segment) => segment.chord.root.step)).toEqual(["G", "D"]);
    expect(exact.at(-1)?.score).toBe(109);
  });

  it("keeps exact-search ties stable and honors the range contract", () => {
    const visited: string[] = [];
    const result = decodeHarmonySequence({
      boundaries: [moment(0), moment(1), moment(2)],
      candidates: (range) => {
        visited.push(`${range.start.offsetTicks}-${range.end.offsetTicks}`);
        return [
          { chord: chord("C"), localScore: 1, sequenceScore: 1, confidence: 0 },
          { chord: chord("G"), localScore: 1, sequenceScore: 1, confidence: 0 },
        ];
      },
      searchMode: "exact",
      rangeAllowed: (_range, startIndex, endIndex) => endIndex - startIndex === 1,
    });

    expect(visited).toEqual(["0-1", "1-2"]);
    expect(result.map((segment) => segment.chord.root.step)).toEqual(["C", "C"]);
  });
});
