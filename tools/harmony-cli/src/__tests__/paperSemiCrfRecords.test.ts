import { describe, expect, it } from "vitest";
import {
  parsePaperSemiCrfEvaluationRecords,
  parsePaperSemiCrfTrainingRecords,
  paperSemiCrfRecordsFileSchema,
} from "../paperSemiCrfRecords";

function recordsFile(role: "train" | "tune" | "final" = "train") {
  return {
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role,
    labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
    featureVersion: "masada-bunescu-enabled-features-v1",
    labels: ["C:maj", "G:maj"],
    maxSegmentLength: 8,
    records: [
      {
        id: "fixture-1",
        corpus: "synthetic",
        groupId: "fixture",
        events: [
          {
            index: 0,
            range: {
              start: { measureIndex: 0, offsetTicks: 0 },
              end: { measureIndex: 0, offsetTicks: 1 },
            },
            startTick: 0,
            endTick: 1,
            durationTicks: 1,
            metricAccent: 1,
            notes: [],
          },
          {
            index: 1,
            range: {
              start: { measureIndex: 0, offsetTicks: 1 },
              end: { measureIndex: 0, offsetTicks: 2 },
            },
            startTick: 1,
            endTick: 2,
            durationTicks: 1,
            metricAccent: 0.5,
            notes: [],
          },
        ],
        targetSegments: [
          { startEvent: 0, endEvent: 1, label: "C:maj" },
          { startEvent: 1, endEvent: 2, label: "G:maj" },
        ],
      },
    ],
  };
}

describe("paper Semi-CRF records contract", () => {
  it("accepts a versioned contiguous records file", () => {
    expect(paperSemiCrfRecordsFileSchema.parse(recordsFile())).toMatchObject({
      role: "train",
      records: [{ id: "fixture-1" }],
    });
  });

  it("rejects event gaps and incomplete target paths", () => {
    const eventGap = recordsFile();
    eventGap.records[0]!.events[1]!.startTick = 2;
    eventGap.records[0]!.events[1]!.endTick = 3;
    expect(() => paperSemiCrfRecordsFileSchema.parse(eventGap)).toThrow("events must be contiguous");

    const incompleteTarget = recordsFile();
    incompleteTarget.records[0]!.targetSegments.pop();
    expect(() => paperSemiCrfRecordsFileSchema.parse(incompleteTarget)).toThrow(
      "target path must cover every event exactly once",
    );
  });

  it("rejects unknown target labels", () => {
    const input = recordsFile();
    input.records[0]!.targetSegments[0]!.label = "D:maj";

    expect(() => paperSemiCrfRecordsFileSchema.parse(input)).toThrow("target label is not in labels");
  });

  it("keeps training, tuning, and final records purpose-separated", () => {
    expect(parsePaperSemiCrfTrainingRecords(recordsFile("train")).role).toBe("train");
    expect(() => parsePaperSemiCrfTrainingRecords(recordsFile("tune"))).toThrow(
      "paper Semi-CRF training requires train records",
    );
    expect(parsePaperSemiCrfEvaluationRecords(recordsFile("tune")).role).toBe("tune");
    expect(() => parsePaperSemiCrfEvaluationRecords(recordsFile("train"))).toThrow(
      "paper Semi-CRF evaluation requires tune or final records",
    );
    expect(() => parsePaperSemiCrfEvaluationRecords(recordsFile("final"))).toThrow(
      "final records require explicit authorization",
    );
    expect(parsePaperSemiCrfEvaluationRecords(recordsFile("final"), { allowFinal: true }).role).toBe("final");
  });
});
