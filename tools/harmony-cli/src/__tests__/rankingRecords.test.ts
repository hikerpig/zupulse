import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { createHarmonyRankingEvaluationRecords, createHarmonyRankingRecords } from "../rankingRecords";
import { harmonyRankingRecordsReportSchema } from "../schemas";

const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
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
          notes: [60, 64, 67].map((midi, index) => ({
            id: `n${index}`,
            moment: { measureIndex: 0, offsetTicks: 0 },
            durationTicks: 1920,
            soundingPitchClass: midi % 12,
            soundingMidi: midi,
            voice: 1,
          })),
        },
      ],
    },
  ],
});

describe("harmony ranking records", () => {
  it("exports deterministic Top-8 candidate features from production ranges", () => {
    const request = {
      corpus: "fixture",
      groupId: "work-1",
      role: "train" as const,
      input,
      includedTrackIds: ["piano"],
      gold: [
        {
          range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1920 } },
          weight: 1920,
          chord,
        },
      ],
    };
    const first = createHarmonyRankingRecords(request);
    const second = createHarmonyRankingRecords(request);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      corpus: "fixture",
      groupId: "work-1",
      outcome: "oracle-hit",
      targetIndex: expect.any(Number),
    });
    expect(first[0]!.candidates.length).toBeLessThanOrEqual(8);
    expect(first[0]!.candidates[0]!.features).toHaveLength(37);
    expect(JSON.stringify(first)).not.toMatch(/\d+\.\d{3,}/);
  });

  it("refuses tune and final holdout records", () => {
    for (const role of ["tune", "regression", "final-holdout"] as const)
      expect(() =>
        createHarmonyRankingRecords({
          corpus: "fixture",
          groupId: "work-1",
          role,
          input,
          includedTrackIds: ["piano"],
          gold: [],
        }),
      ).toThrow(`ranking records require train role: work-1 is ${role}`);
  });

  it("allows tune records only through the evaluation-only entry point", () => {
    expect(
      createHarmonyRankingEvaluationRecords({
        corpus: "fixture",
        groupId: "work-1",
        role: "tune",
        input,
        includedTrackIds: ["piano"],
        gold: [
          {
            range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1920 } },
            weight: 1920,
            chord,
          },
        ],
      }),
    ).toHaveLength(1);
    expect(() =>
      createHarmonyRankingEvaluationRecords({
        corpus: "fixture",
        groupId: "work-1",
        role: "final-holdout",
        input,
        includedTrackIds: ["piano"],
        gold: [],
      }),
    ).toThrow("ranking evaluation records require tune role");
  });

  it("rejects scores with more than two decimals at the report boundary", () => {
    expect(() =>
      harmonyRankingRecordsReportSchema.parse({
        schemaVersion: "1.0.0",
        command: "ranking-records",
        featureVersion: "relative-pc-presence-v1",
        groupsSha256: "a".repeat(64),
        sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "b".repeat(64) }],
        records: [
          {
            id: "fixture:work:0:0",
            corpus: "fixture",
            groupId: "work",
            range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 10 } },
            weight: 10,
            outcome: "oracle-hit",
            primaryIndex: 0,
            targetIndex: 0,
            candidates: [{ chord, features: Array(37).fill(0), ruleLocalScore: 0.123, ruleSequenceScore: 1 }],
          },
        ],
      }),
    ).toThrow("scores must have at most two decimals");
  });
});
