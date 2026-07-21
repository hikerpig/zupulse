import { describe, expect, it } from "vitest";
import type { HarmonyCandidate } from "../candidates";
import { mergeHarmonySegments, suppressShortNonChordSegments } from "../postprocess";

describe("non-chord tone postprocessing", () => {
  it("merges a short identical middle segment", () => {
    const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
    const result = mergeHarmonySegments([
      {
        status: "resolved" as const,
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
        chord,
        confidence: 0.9,
        alternatives: [],
      },
      {
        status: "resolved" as const,
        range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 0, offsetTicks: 2 } },
        chord,
        confidence: 0.8,
        alternatives: [],
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps merged alternatives unique and capped at eight", () => {
    const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
    const candidate = (index: number): HarmonyCandidate => ({
      chord: {
        root: { step: (["C", "D", "E", "F", "G", "A", "B"] as const)[index % 7]!, alter: 0 },
        kind: index < 7 ? "major" : "minor",
        degrees: [],
      },
      localScore: index,
      sequenceScore: index,
      confidence: 0.9,
    });
    const segment = (start: number, end: number, alternatives: HarmonyCandidate[]) => ({
      status: "resolved" as const,
      range: { start: { measureIndex: 0, offsetTicks: start }, end: { measureIndex: 0, offsetTicks: end } },
      chord,
      confidence: 0.9,
      alternatives,
    });

    const result = mergeHarmonySegments([
      segment(0, 1, [0, 1, 2, 3, 4, 5].map(candidate)),
      segment(1, 2, [candidate(2), ...[6, 7, 8, 9, 10].map(candidate)]),
    ]);

    expect(result[0]?.alternatives).toHaveLength(8);
    expect(result[0]?.alternatives.map((item) => item.localScore)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("suppresses a short contrasting segment between equal surrounding chords", () => {
    const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
    const dMinor = { root: { step: "D" as const, alter: 0 as const }, kind: "minor" as const, degrees: [] };
    const segment = (start: number, end: number, chord: typeof cMajor | typeof dMinor) => ({
      status: "resolved" as const,
      range: { start: { measureIndex: 0, offsetTicks: start }, end: { measureIndex: 0, offsetTicks: end } },
      chord,
      confidence: 0.8,
      alternatives: [],
    });

    const result = suppressShortNonChordSegments(
      [segment(0, 480, cMajor), segment(480, 600, dMinor), segment(600, 960, cMajor)],
      120,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.range).toEqual({
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 960 },
    });
  });

  it("preserves a sustained contrasting segment", () => {
    const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
    const dMinor = { root: { step: "D" as const, alter: 0 as const }, kind: "minor" as const, degrees: [] };
    const segment = (start: number, end: number, chord: typeof cMajor | typeof dMinor) => ({
      status: "resolved" as const,
      range: { start: { measureIndex: 0, offsetTicks: start }, end: { measureIndex: 0, offsetTicks: end } },
      chord,
      confidence: 0.8,
      alternatives: [],
    });

    expect(
      suppressShortNonChordSegments(
        [segment(0, 240, cMajor), segment(240, 720, dMinor), segment(720, 960, cMajor)],
        120,
      ),
    ).toHaveLength(3);
  });
});
