import { describe, expect, it } from "vitest";
import { compareEngineDrafts } from "../benchmark/engine-comparison";
import {
  evaluateRepairCandidates,
  evaluateRepairCandidateSelection,
  evaluateRepairCandidatesIndividually,
} from "../benchmark/repair-candidate-evaluation";
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

  it("scores candidates against an ordered-staff comparison view", () => {
    const primary = splitPianoDraft([60, 64], [48, 52]);
    const expected = mergedPianoDraft([60, 62, 64], [48, 50, 52]);
    const comparison = compareEngineDrafts(primary, expected, { topologyMode: "ordered-staves" });

    const result = evaluateRepairCandidates(primary, expected, comparison);

    expect(result.appliedCandidateCount).toBe(1);
    expect(result.after.joint.f1).toBe(1);
  });

  it("scores every candidate independently against the unchanged primary Draft", () => {
    const primary = draft([60, 64]);
    const secondary = draft([62, 65]);
    const expected = draft([62, 64]);
    const comparison = compareEngineDrafts(primary, secondary);

    const results = evaluateRepairCandidatesIndividually(primary, expected, comparison);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.operation)).toEqual(["replace", "replace"]);
    expect(results[0]!.before).toEqual(results[1]!.before);
    expect(results[0]!.after.pitch.f1).toBeGreaterThan(results[0]!.before.pitch.f1);
    expect(results[1]!.after.pitch.f1).toBeLessThan(results[1]!.before.pitch.f1);

    const selected = evaluateRepairCandidateSelection(primary, expected, comparison, [results[0]!.candidateSha256]);
    expect(selected.appliedCandidateCount).toBe(1);
    expect(selected.after.pitch.f1).toBeGreaterThan(selected.before.pitch.f1);
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

function splitPianoDraft(upper: readonly number[], lower: readonly number[]): OmrScoreDraft {
  const result = draft(upper);
  const lowerPart = draft(lower).parts[0]!;
  result.parts.push({ ...lowerPart, id: "P2", name: "Lower" });
  return result;
}

function mergedPianoDraft(upper: readonly number[], lower: readonly number[]): OmrScoreDraft {
  const result = draft(upper);
  const lowerStaff = draft(lower).parts[0]!.staves[0]!;
  result.parts[0]!.staves.push({ ...lowerStaff, index: 1 });
  return result;
}
