import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { harmonyStructuredRecordPieceSchema } from "../schemas";
import { createTrainingStructuredRecordPiece, createTuneStructuredRecordPiece } from "../structuredRecords";

const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const gMajor = { root: { step: "G" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const fsMajor = { root: { step: "F" as const, alter: 1 as const }, kind: "major" as const, degrees: [] };
const range = (start: number, end: number) => ({
  start: { measureIndex: 0, offsetTicks: start },
  end: { measureIndex: 0, offsetTicks: end },
});
const input = createHarmonyAnalysisInput({
  ticksPerQuarter: 480,
  measures: [{ index: 0, durationTicks: 960, timeSignature: { numerator: 2, denominator: 4 } }],
  tracks: [
    {
      id: "piano",
      name: "Piano",
      isPercussion: false,
      staves: [
        {
          index: 0,
          notes: [
            ...[60, 64, 67].map((midi, index) => ({
              id: `c-${index}`,
              moment: { measureIndex: 0, offsetTicks: 0 },
              durationTicks: 480,
              soundingPitchClass: midi % 12,
              soundingMidi: midi,
              voice: index + 1,
            })),
            ...[55, 59, 62].map((midi, index) => ({
              id: `g-${index}`,
              moment: { measureIndex: 0, offsetTicks: 480 },
              durationTicks: 480,
              soundingPitchClass: midi % 12,
              soundingMidi: midi,
              voice: index + 1,
            })),
          ],
        },
      ],
    },
  ],
});

describe("structured path records", () => {
  it("exports deterministic compact windows with natural negative ranges", () => {
    const request = {
      id: "piece",
      corpus: "fixture",
      groupId: "work",
      role: "train" as const,
      input,
      includedTrackIds: ["piano"],
      gold: [
        { range: range(0, 480), chord: cMajor },
        { range: range(480, 960), chord: gMajor },
      ],
    };
    const first = createTrainingStructuredRecordPiece(request);
    const second = createTrainingStructuredRecordPiece(request);

    expect(first).toEqual(second);
    expect(harmonyStructuredRecordPieceSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(first.windows).toHaveLength(1);
    expect(first.windows[0]).toMatchObject({
      startBoundaryIndex: 0,
      endBoundaryIndex: 2,
      gold: [
        { startBoundaryIndex: 0, endBoundaryIndex: 1 },
        { startBoundaryIndex: 1, endBoundaryIndex: 2 },
      ],
    });
    expect(first.windows[0]!.ranges).toHaveLength(3);
    expect(first.windows[0]!.ranges.flatMap((item) => item.candidates)).not.toHaveLength(0);
    expect(
      first.windows[0]!.ranges.flatMap((item) => item.candidates)
        .flatMap((candidate) => [candidate.ruleSequenceScore, ...candidate.segmentFeatures])
        .every(hasAtMostTwoDecimals),
    ).toBe(true);
  });

  it("records candidate misses and refuses cross-role access", () => {
    const request = {
      id: "piece",
      corpus: "fixture",
      groupId: "work",
      input,
      includedTrackIds: ["piano"],
      gold: [{ range: range(0, 480), chord: fsMajor }],
    };

    expect(createTrainingStructuredRecordPiece({ ...request, role: "train" })).toMatchObject({
      windows: [],
      excluded: { candidateMiss: 1 },
    });
    expect(() => createTrainingStructuredRecordPiece({ ...request, role: "tune" })).toThrow(
      "structured training records require train role",
    );
    expect(createTuneStructuredRecordPiece({ ...request, role: "tune" })).toMatchObject({
      excluded: { candidateMiss: 1 },
    });
    expect(() => createTuneStructuredRecordPiece({ ...request, role: "regression" })).toThrow(
      "structured tune records require tune role",
    );
  });
});

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}
