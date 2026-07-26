import { describe, expect, it } from "vitest";
import { evaluatePaperSemiCrfRecords } from "../paperSemiCrfEvaluation";
import { paperSemiCrfRecordsFileSchema } from "../paperSemiCrfRecords";
import { trainPaperSemiCrf } from "../paperSemiCrfTraining";

function records(role: "train" | "tune") {
  return paperSemiCrfRecordsFileSchema.parse({
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role,
    labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
    featureVersion: "masada-bunescu-enabled-features-v1",
    labels: ["C:maj", "G:maj"],
    maxSegmentLength: 1,
    records: [
      {
        id: `${role}-c-major`,
        corpus: "synthetic",
        groupId: role,
        events: [
          {
            index: 0,
            range: {
              start: { measureIndex: 0, offsetTicks: 0 },
              end: { measureIndex: 0, offsetTicks: 480 },
            },
            startTick: 0,
            endTick: 480,
            durationTicks: 480,
            metricAccent: 1,
            notes: [60, 64, 67].map((midi, index) => ({
              id: `note-${index}`,
              trackId: "piano",
              staffIndex: 0,
              voice: index + 1,
              onset: { measureIndex: 0, offsetTicks: 0 },
              onsetTick: 0,
              soundingPitchClass: midi % 12,
              durationTicks: 480,
              sourceDurationTicks: 480,
              heldFromPrevious: false,
              metricAccent: 1,
              isBass: midi === 60,
              soundingMidi: midi,
            })),
            bassPitchClass: 0,
          },
        ],
        targetSegments: [{ startEvent: 0, endEvent: 1, label: "C:maj" }],
      },
    ],
  });
}

describe("paper Semi-CRF evaluation", () => {
  it("reports the author's micro event accuracy and exact-segment P/R/F1", () => {
    const trained = trainPaperSemiCrf({
      records: records("train"),
      l2: 0.1,
      minFeatureCount: 0,
      maxIterations: 20,
    });

    expect(evaluatePaperSemiCrfRecords({ records: records("tune"), model: trained.model }).metrics).toEqual({
      events: { correct: 1, total: 1, accuracy: 1 },
      segments: { correct: 1, predicted: 1, gold: 1, precision: 1, recall: 1, f1: 1 },
    });
  });

  it("rejects a model whose label inventory differs from the records", () => {
    const trained = trainPaperSemiCrf({
      records: records("train"),
      l2: 0.1,
      minFeatureCount: 0,
      maxIterations: 1,
    });

    expect(() =>
      evaluatePaperSemiCrfRecords({
        records: records("tune"),
        model: { ...trained.model, labels: [...trained.model.labels].reverse() },
      }),
    ).toThrow("model labels must exactly match evaluation records");
  });
});
