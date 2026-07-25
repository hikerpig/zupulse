import {
  analyzeHarmonyRules,
  createHarmonyAnalysisInput,
  createZeroHarmonyStructuredLinearModel,
  STRUCTURED_SEGMENT_FEATURE_LENGTH,
  STRUCTURED_TRANSITION_FEATURE_LENGTH,
  type HarmonyStructuredLinearModel,
} from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import type { HarmonyStructuredRecordPiece } from "../schemas";
import { createTrainingStructuredRecordPiece } from "../structuredRecords";
import { decodeStructuredRecordWindow, trainHarmonyStructuredPerceptron } from "../structuredTraining";

const zeros = (length: number) => Array(length).fill(0);
const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const gMajor = { root: { step: "G" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const piece: HarmonyStructuredRecordPiece = {
  schemaVersion: "1.0.0",
  featureVersion: "semi-crf-linear-v1",
  id: "piece",
  corpus: "fixture",
  groupId: "group",
  ticksPerQuarter: 480,
  boundaries: [
    { measureIndex: 0, offsetTicks: 0 },
    { measureIndex: 0, offsetTicks: 480 },
  ],
  chords: [cMajor, gMajor],
  windows: [
    {
      startBoundaryIndex: 0,
      endBoundaryIndex: 1,
      ranges: [
        {
          startBoundaryIndex: 0,
          endBoundaryIndex: 1,
          durationQuarterNotes: 1,
          candidates: [
            {
              chordIndex: 0,
              ruleSequenceScore: 0,
              segmentFeatures: [1, ...zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH - 1)],
            },
            {
              chordIndex: 1,
              ruleSequenceScore: 1,
              segmentFeatures: [-1, ...zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH - 1)],
            },
          ],
        },
      ],
      gold: [{ startBoundaryIndex: 0, endBoundaryIndex: 1, rangeIndex: 0, candidateIndex: 0 }],
    },
  ],
  excluded: { unsupported: 0, missingBoundary: 0, excessiveDuration: 0, candidateMiss: 0 },
};

describe("structured harmony perceptron", () => {
  it("raises the complete gold path above an incorrect rule path after one update", async () => {
    const zeroModel: HarmonyStructuredLinearModel = {
      schemaVersion: "1.0.0",
      featureVersion: "semi-crf-linear-v1",
      algorithmVersion: "averaged-structured-perceptron-v1",
      trainingRecordsSha256: "a".repeat(64),
      trainingGroupsSha256: "b".repeat(64),
      epochs: 0,
      learningRate: 0,
      ruleScale: 1,
      modelScale: 1,
      segmentWeights: zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH),
      transitionWeights: zeros(STRUCTURED_TRANSITION_FEATURE_LENGTH),
    };
    expect(decodeStructuredRecordWindow(piece, piece.windows[0]!, zeroModel)).toEqual([
      { rangeIndex: 0, candidateIndex: 1 },
    ]);

    const result = await trainHarmonyStructuredPerceptron({
      recordsSha256: "a".repeat(64),
      groupsSha256: "b".repeat(64),
      epochs: 1,
      learningRate: 1,
      pieces: async function* () {
        yield piece;
      },
    });

    expect(decodeStructuredRecordWindow(piece, piece.windows[0]!, result.model)).toEqual([
      { rangeIndex: 0, candidateIndex: 0 },
    ]);
    expect(result.report.epochs[0]).toMatchObject({ pieces: 1, windows: 1, exactPaths: 0 });
    expect(result.model.segmentWeights[0]).toBeGreaterThan(0);
  });

  it("keeps segment and transition weight vector lengths fixed", async () => {
    const result = await trainHarmonyStructuredPerceptron({
      recordsSha256: "a".repeat(64),
      groupsSha256: "b".repeat(64),
      epochs: 0,
      learningRate: 0.1,
      pieces: async function* () {},
    });

    expect(result.model.segmentWeights).toHaveLength(STRUCTURED_SEGMENT_FEATURE_LENGTH);
    expect(result.model.transitionWeights).toHaveLength(STRUCTURED_TRANSITION_FEATURE_LENGTH);
  });

  it("decodes the same quantized model path in records and the runtime analyzer", () => {
    const analysisInput = createHarmonyAnalysisInput({
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
                ...[0, 4, 7].map((soundingPitchClass, index) => ({
                  id: `c-${index}`,
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass,
                  voice: 1,
                })),
                ...[7, 11, 2].map((soundingPitchClass, index) => ({
                  id: `g-${index}`,
                  moment: { measureIndex: 0, offsetTicks: 480 },
                  durationTicks: 480,
                  soundingPitchClass,
                  voice: 1,
                })),
              ],
            },
          ],
        },
      ],
    });
    const recordPiece = createTrainingStructuredRecordPiece({
      id: "runtime-parity",
      corpus: "fixture",
      groupId: "group",
      role: "train",
      input: analysisInput,
      includedTrackIds: ["piano"],
      gold: [
        {
          range: {
            start: { measureIndex: 0, offsetTicks: 0 },
            end: { measureIndex: 0, offsetTicks: 480 },
          },
          chord: cMajor,
        },
        {
          range: {
            start: { measureIndex: 0, offsetTicks: 480 },
            end: { measureIndex: 0, offsetTicks: 960 },
          },
          chord: {
            ...gMajor,
            bass: { step: "D", alter: 0 },
          },
        },
      ],
    });
    const model = createZeroHarmonyStructuredLinearModel({
      trainingRecordsSha256: "a".repeat(64),
      trainingGroupsSha256: "b".repeat(64),
    });
    model.segmentWeights[63] = -0.25;
    const window = recordPiece.windows[0]!;
    const recordPath = decodeStructuredRecordWindow(recordPiece, window, model).map((step) => {
      const range = window.ranges[step.rangeIndex]!;
      const candidate = range.candidates[step.candidateIndex]!;
      return {
        start: recordPiece.boundaries[range.startBoundaryIndex],
        end: recordPiece.boundaries[range.endBoundaryIndex],
        chord: recordPiece.chords[candidate.chordIndex],
      };
    });
    const runtimePath = analyzeHarmonyRules(analysisInput, {
      includedTrackIds: ["piano"],
      topK: 8,
      decisionThreshold: 0,
      structuredModel: model,
    }).map((segment) => ({
      start: segment.range.start,
      end: segment.range.end,
      chord: segment.status === "resolved" ? segment.chord : undefined,
    }));

    expect(runtimePath).toEqual(recordPath);
  });
});
