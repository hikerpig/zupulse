import { describe, expect, it } from "vitest";
import { compareEngineDrafts } from "../benchmark/engine-comparison";
import { evaluateRepairCandidates } from "../benchmark/repair-candidate-evaluation";
import type { OmrScoreDraft } from "../schemas";

describe("evaluateRepairCandidates", () => {
  it("simulates a missing-measure candidate without mutating the primary Draft", () => {
    const primary = draft([60, 64, 65]);
    const expected = draft([60, 62, 64, 65]);
    const original = structuredClone(primary);
    const comparison = compareEngineDrafts(primary, expected);

    const result = evaluateRepairCandidates(primary, expected, comparison);

    expect(result.appliedCandidateCount).toBe(1);
    expect(result.before.joint.f1).toBeLessThan(1);
    expect(result.after.joint.f1).toBe(1);
    expect(result.after.validMeasure.rate).toBe(1);
    expect(primary).toEqual(original);
  });

  it("leaves metrics unchanged when ambiguous alignment suppresses candidates", () => {
    const primary = draft([60]);
    const expected = draft([60, 60]);
    const comparison = compareEngineDrafts(primary, expected);

    const result = evaluateRepairCandidates(primary, expected, comparison);

    expect(result.appliedCandidateCount).toBe(0);
    expect(result.after).toEqual(result.before);
  });
});

function draft(pitches: readonly number[]): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Part",
        staves: [
          {
            index: 0,
            measures: pitches.map((soundingMidi, index) => ({
              index,
              duration: { numerator: 1, denominator: 1 },
              voices: [
                {
                  index: 1,
                  events: [
                    {
                      type: "note" as const,
                      id: `m${index}-n1`,
                      onset: { numerator: 0, denominator: 1 },
                      duration: { numerator: 1, denominator: 1 },
                      soundingMidi,
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
    diagnostics: [],
  };
}
