import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { createBoundaryEvaluationRecords, createBoundaryTrainingRecords } from "../boundaryRecords";

const input = createHarmonyAnalysisInput({
  ticksPerQuarter: 480,
  measures: [{ index: 0, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } }],
  tracks: [
    {
      id: "piano",
      name: "Piano",
      isPercussion: false,
      staves: [
        {
          index: 0,
          notes: [
            {
              id: "c",
              moment: { measureIndex: 0, offsetTicks: 0 },
              durationTicks: 720,
              soundingPitchClass: 0,
              soundingMidi: 48,
              voice: 1,
            },
            {
              id: "e",
              moment: { measureIndex: 0, offsetTicks: 0 },
              durationTicks: 720,
              soundingPitchClass: 4,
              soundingMidi: 64,
              voice: 2,
            },
            {
              id: "passing",
              moment: { measureIndex: 0, offsetTicks: 240 },
              durationTicks: 120,
              soundingPitchClass: 7,
              soundingMidi: 67,
              voice: 3,
            },
            {
              id: "d",
              moment: { measureIndex: 0, offsetTicks: 720 },
              durationTicks: 720,
              soundingPitchClass: 2,
              soundingMidi: 50,
              voice: 1,
            },
            {
              id: "f",
              moment: { measureIndex: 0, offsetTicks: 720 },
              durationTicks: 720,
              soundingPitchClass: 5,
              soundingMidi: 65,
              voice: 2,
            },
          ],
        },
      ],
    },
  ],
});

const gold = [
  {
    range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 720 } },
    chord: { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] },
  },
  {
    range: { start: { measureIndex: 0, offsetTicks: 720 }, end: { measureIndex: 0, offsetTicks: 1920 } },
    chord: { root: { step: "D" as const, alter: 0 as const }, kind: "minor" as const, degrees: [] },
  },
];

describe("harmony boundary records", () => {
  it("labels only exact mapped gold changes and excludes fixed metric boundaries", () => {
    const records = createBoundaryTrainingRecords({
      corpus: "fixture",
      groupId: "work",
      role: "train",
      input,
      includedTrackIds: ["piano"],
      gold,
    });

    expect(records.map((record) => [record.moment.offsetTicks, record.target, record.features])).toEqual([
      [240, 0, [0, 0, 1, 0.08, 0.33]],
      [360, 0, [0, 0, 0.67, 0, 0.33]],
      [720, 1, [0, 1, 0, 0.17, 1]],
    ]);
    expect(JSON.stringify(records)).not.toMatch(/\d+\.\d{3,}/);
  });

  it("keeps train and tune entry points isolated", () => {
    const request = { corpus: "fixture", groupId: "work", input, includedTrackIds: ["piano"], gold };
    expect(() => createBoundaryTrainingRecords({ ...request, role: "tune" })).toThrow(
      "boundary records require train role",
    );
    expect(createBoundaryEvaluationRecords({ ...request, role: "tune" })).not.toHaveLength(0);
    expect(() => createBoundaryEvaluationRecords({ ...request, role: "final-holdout" })).toThrow(
      "boundary evaluation records require tune role",
    );
  });
});
