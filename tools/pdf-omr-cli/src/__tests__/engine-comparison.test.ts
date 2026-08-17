import { describe, expect, it } from "vitest";
import { compareEngineDrafts, engineDraftComparisonSchema } from "../benchmark/engine-comparison";
import type { OmrScoreDraft } from "../schemas";

describe("compareEngineDrafts", () => {
  it("reports agreement for equal musical facts while ignoring event IDs", () => {
    const primary = draft([60, 62, 64]);
    const secondary = draft([60, 62, 64]);
    primary.parts[0]!.staves[0]!.measures[1]!.voices[0]!.events.push({
      type: "note",
      id: "primary-second-note",
      onset: { numerator: 1, denominator: 2 },
      duration: { numerator: 1, denominator: 2 },
      soundingMidi: 65,
    });
    secondary.parts[0]!.staves[0]!.measures[1]!.voices[0]!.events.unshift({
      type: "note",
      id: "secondary-second-note",
      onset: { numerator: 1, denominator: 2 },
      duration: { numerator: 1, denominator: 2 },
      soundingMidi: 65,
    });
    secondary.parts[0]!.staves[0]!.measures[1]!.voices[0]!.events[0]!.id = "secondary-event";

    expect(compareEngineDrafts(primary, secondary)).toMatchObject({
      agreement: true,
      alignedMeasureCount: 3,
      proposals: [],
    });
  });

  it("reports one missing middle measure instead of shifted content disagreements", () => {
    const comparison = compareEngineDrafts(draft([60, 64, 65]), draft([60, 62, 64, 65]));

    expect(comparison).toMatchObject({
      agreement: false,
      alignedMeasureCount: 3,
      proposals: [
        {
          kind: "measure-missing-in-primary",
          primaryMeasureIndex: null,
          secondaryMeasureIndex: 1,
          autoApplicable: false,
          repairCandidate: {
            operation: "insert",
            targetMeasureIndex: 1,
            sourceMeasureIndex: 1,
            reviewRequired: true,
            autoApplicable: false,
            measure: {
              staves: [
                {
                  staffIndex: 0,
                  duration: { numerator: 1, denominator: 1 },
                  voices: [
                    {
                      index: 1,
                      events: [
                        {
                          type: "note",
                          onset: { numerator: 0, denominator: 1 },
                          duration: { numerator: 1, denominator: 1 },
                          soundingMidi: 62,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
    expect(comparison.proposals[0]!.repairCandidate).toMatchObject({
      sourceFingerprint: comparison.proposals[0]!.secondaryFingerprint,
      candidateSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("keeps aligned content disagreements non-automatic", () => {
    const comparison = compareEngineDrafts(draft([60, 62]), draft([60, 63]));

    expect(comparison).toMatchObject({
      agreement: false,
      alignedMeasureCount: 2,
      proposals: [
        {
          kind: "measure-content-disagreement",
          primaryMeasureIndex: 1,
          secondaryMeasureIndex: 1,
          autoApplicable: false,
          repairCandidate: {
            operation: "replace",
            targetMeasureIndex: 1,
            sourceMeasureIndex: 1,
            reviewRequired: true,
            autoApplicable: false,
          },
        },
      ],
    });
  });

  it("proposes deleting a primary-only measure without fabricating replacement content", () => {
    const comparison = compareEngineDrafts(draft([60, 62, 64]), draft([60, 64]));

    expect(comparison.proposals).toEqual([
      expect.objectContaining({
        kind: "measure-missing-in-secondary",
        primaryMeasureIndex: 1,
        secondaryMeasureIndex: null,
        repairCandidate: expect.objectContaining({
          operation: "delete",
          targetMeasureIndex: 1,
          reviewRequired: true,
          autoApplicable: false,
        }),
      }),
    ]);
    expect(comparison.proposals[0]!.repairCandidate).not.toHaveProperty("measure");
  });

  it("suppresses repair candidates when repeated measures make alignment ambiguous", () => {
    const comparison = compareEngineDrafts(draft([60]), draft([60, 60]));

    expect(comparison.alignmentAmbiguous).toBe(true);
    expect(comparison.proposals).toHaveLength(1);
    expect(comparison.proposals[0]).not.toHaveProperty("repairCandidate");
  });

  it("rejects a repair candidate whose hashed musical facts were modified", () => {
    const comparison = compareEngineDrafts(draft([60, 64]), draft([60, 62, 64]));
    const tampered = structuredClone(comparison);
    const candidate = tampered.proposals[0]!.repairCandidate;
    if (candidate?.operation !== "insert") throw new Error("expected insert candidate");
    const event = candidate.measure.staves[0]!.voices[0]!.events[0]!;
    if (event.type !== "note") throw new Error("expected note candidate");
    event.soundingMidi = 99;

    expect(() => engineDraftComparisonSchema.parse(tampered)).toThrow();
  });

  it("rejects repair candidates on ambiguous alignments even if their hashes are valid", () => {
    const comparison = compareEngineDrafts(draft([60, 64]), draft([60, 62, 64]));
    const invalid = { ...comparison, alignmentAmbiguous: true };

    expect(() => engineDraftComparisonSchema.parse(invalid)).toThrow();
  });

  it("fails closed when part and staff topology differs", () => {
    const secondary = draft([60]);
    secondary.parts[0]!.staves.push({ index: 1, measures: structuredClone(secondary.parts[0]!.staves[0]!.measures) });

    expect(() => compareEngineDrafts(draft([60]), secondary)).toThrow(
      expect.objectContaining({
        code: "BENCHMARK_EVALUATION_LIMITATION",
        context: { reason: "incompatible-engine-topology" },
      }),
    );
  });

  it("fails closed when multiple parts lack an explicit cross-engine identity mapping", () => {
    const primary = draft([60]);
    const secondary = draft([60]);
    primary.parts.push(structuredClone(primary.parts[0]!));
    secondary.parts.push(structuredClone(secondary.parts[0]!));

    expect(() => compareEngineDrafts(primary, secondary)).toThrow(
      expect.objectContaining({
        code: "BENCHMARK_EVALUATION_LIMITATION",
        context: { reason: "cross-engine-part-identity-unavailable" },
      }),
    );
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
              timeSignature: { numerator: 4, denominator: 4 },
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
