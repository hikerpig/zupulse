import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { evaluateStructuredTuneOracle, evaluateStructuredTrainingOracle } from "../structuredOracle";

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

describe("structured harmony oracle", () => {
  it("reports a fully representable gold path and deterministic search size", () => {
    const result = evaluateStructuredTrainingOracle({
      corpus: "fixture",
      groupId: "work",
      role: "train",
      input,
      includedTrackIds: ["piano"],
      gold: [
        { range: range(0, 480), chord: cMajor },
        { range: range(480, 960), chord: gMajor },
      ],
      maxSpan: 16,
      topK: 8,
    });

    expect(result).toMatchObject({
      mappedSegments: 2,
      unsupportedSegments: 0,
      boundaries: { required: 4, representable: 4, ratio: 1 },
      spans: { required: 2, representable: 2, ratio: 1 },
      candidates: { evaluable: 2, oracleHits: 2, recall: 1 },
      path: { representableSegments: 2, ratio: 1, complete: true },
      failures: {
        missingBoundarySegments: 0,
        excessiveSpanSegments: 0,
        candidateMissSegments: 0,
        maxObservedSpan: 1,
        samples: [],
      },
      search: {
        legalBoundaries: 3,
        ranges: 3,
        candidates: 24,
        candidateCountMode: "top-k-upper-bound",
        estimatedBytes: expect.any(Number),
      },
    });
    expect(result.search.candidates).toBeGreaterThan(0);
  });

  it("separates missing boundaries, excessive spans, and candidate misses", () => {
    const missingBoundary = evaluateStructuredTrainingOracle({
      corpus: "fixture",
      groupId: "work",
      role: "train",
      input,
      includedTrackIds: ["piano"],
      gold: [{ range: range(240, 480), chord: cMajor }],
      maxSpan: 16,
      topK: 8,
    });
    const excessiveSpan = evaluateStructuredTrainingOracle({
      corpus: "fixture",
      groupId: "work",
      role: "train",
      input,
      includedTrackIds: ["piano"],
      gold: [{ range: range(0, 960), chord: cMajor }],
      maxSpan: 1,
      topK: 8,
    });
    const candidateMiss = evaluateStructuredTrainingOracle({
      corpus: "fixture",
      groupId: "work",
      role: "train",
      input,
      includedTrackIds: ["piano"],
      gold: [{ range: range(0, 480), chord: fsMajor }],
      maxSpan: 16,
      topK: 8,
    });

    expect(missingBoundary).toMatchObject({
      boundaries: { required: 2, representable: 1, ratio: 0.5 },
      spans: { required: 1, representable: 0, ratio: 0 },
      path: { complete: false },
      failures: { missingBoundarySegments: 1 },
    });
    expect(excessiveSpan).toMatchObject({
      boundaries: { ratio: 1 },
      spans: { required: 1, representable: 0, ratio: 0 },
      candidates: { evaluable: 0, oracleHits: 0, recall: 1 },
      path: { complete: false },
      failures: { excessiveSpanSegments: 1, maxObservedSpan: 2 },
    });
    expect(candidateMiss).toMatchObject({
      boundaries: { ratio: 1 },
      spans: { ratio: 1 },
      candidates: { evaluable: 1, oracleHits: 0, recall: 0 },
      path: { representableSegments: 0, complete: false },
      failures: { candidateMissSegments: 1 },
    });
  });

  it("excludes unsupported labels and enforces train/tune role isolation", () => {
    const request = {
      corpus: "fixture",
      groupId: "work",
      input,
      includedTrackIds: ["piano"],
      gold: [{ range: range(0, 480) }],
      maxSpan: 16,
      topK: 8,
    };

    expect(evaluateStructuredTrainingOracle({ ...request, role: "train" })).toMatchObject({
      mappedSegments: 0,
      unsupportedSegments: 1,
      path: { complete: true },
    });
    expect(() => evaluateStructuredTrainingOracle({ ...request, role: "tune" })).toThrow(
      "structured oracle requires train role",
    );
    expect(evaluateStructuredTuneOracle({ ...request, role: "tune" })).toMatchObject({
      unsupportedSegments: 1,
    });
    expect(() => evaluateStructuredTuneOracle({ ...request, role: "final-holdout" })).toThrow(
      "structured tune oracle requires tune role",
    );
  });
});
