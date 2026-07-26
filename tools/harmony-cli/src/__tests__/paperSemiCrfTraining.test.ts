import { parsePaperSemiCrfLinearModel } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { paperSemiCrfRecordsFileSchema } from "../paperSemiCrfRecords";
import { trainPaperSemiCrf } from "../paperSemiCrfTraining";

const event = {
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
};

function trainingRecords() {
  return paperSemiCrfRecordsFileSchema.parse({
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role: "train",
    labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
    featureVersion: "masada-bunescu-enabled-features-v1",
    labels: ["C:maj", "G:maj"],
    maxSegmentLength: 1,
    records: [
      {
        id: "c-major",
        corpus: "synthetic",
        groupId: "train",
        events: [event],
        targetSegments: [{ startEvent: 0, endEvent: 1, label: "C:maj" }],
      },
    ],
  });
}

describe("paper Semi-CRF corpus training", () => {
  it("decreases regularized corpus NLL and emits a valid deterministic model", () => {
    const input = {
      records: trainingRecords(),
      l2: 0.1,
      minFeatureCount: 0,
      maxIterations: 20,
      gradientTolerance: 1e-8,
    };
    const first = trainPaperSemiCrf(input);
    const second = trainPaperSemiCrf(input);

    expect(first.report.finalObjective).toBeLessThan(first.report.initialObjective);
    expect(first.report.featureCount).toBeGreaterThan(0);
    expect(parsePaperSemiCrfLinearModel(first.model)).toEqual(first.model);
    expect(first.model).toEqual(second.model);
    expect(first.checkpoint).toEqual(second.checkpoint);
    expect({ ...first.report, performance: undefined }).toEqual({ ...second.report, performance: undefined });
    expect(first.report.performance.compileMs).toBeGreaterThanOrEqual(0);
    expect(first.report.performance.objectiveEvaluations).toBeGreaterThan(0);
    expect(first.report.performance.objectiveRuntimeMs).toBeGreaterThanOrEqual(0);
  });

  it("applies L2 once to the corpus objective", () => {
    const records = trainingRecords();
    const one = trainPaperSemiCrf({
      records,
      l2: 0.5,
      minFeatureCount: 0,
      maxIterations: 0,
      initialWeights: [1],
      featureNames: ["ROOT_COVERED"],
    });
    const duplicated = trainPaperSemiCrf({
      records: { ...records, records: [...records.records, { ...records.records[0]!, id: "copy" }] },
      l2: 0.5,
      minFeatureCount: 0,
      maxIterations: 0,
      initialWeights: [1],
      featureNames: ["ROOT_COVERED"],
    });

    expect(duplicated.report.initialObjective - 0.25).toBeCloseTo(2 * (one.report.initialObjective - 0.25), 10);
  });

  it("resumes synthetic corpus training without changing the result", () => {
    const base = {
      records: trainingRecords(),
      l2: 0.1,
      minFeatureCount: 0,
      gradientTolerance: 0,
    };
    const partial = trainPaperSemiCrf({ ...base, maxIterations: 2 });
    const resumed = trainPaperSemiCrf({
      ...base,
      maxIterations: 3,
      featureNames: partial.model.featureNames,
      resume: partial.checkpoint,
    });
    const uninterrupted = trainPaperSemiCrf({ ...base, maxIterations: 5 });

    expect(resumed.model).toEqual(uninterrupted.model);
    expect(resumed.checkpoint).toEqual(uninterrupted.checkpoint);
  });
});
