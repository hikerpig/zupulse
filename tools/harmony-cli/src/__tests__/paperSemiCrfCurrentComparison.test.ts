import { describe, expect, it } from "vitest";
import {
  calculatePaperSemiCrfWindowMetrics,
  type PaperSemiCrfWindowMetricRecord,
} from "../paperSemiCrfCurrentComparison";

describe("paper Semi-CRF current-corpus comparison", () => {
  it("reports event, duration, exact-segment, boundary, and density metrics on identical windows", () => {
    const records: PaperSemiCrfWindowMetricRecord[] = [
      {
        id: "piece:window:0",
        eventDurationTicks: [1, 3],
        goldSegments: [{ startEvent: 0, endEvent: 2, labelId: 0 }],
      },
    ];

    const metrics = calculatePaperSemiCrfWindowMetrics(records, [
      {
        id: "piece:window:0",
        segments: [
          { startEvent: 0, endEvent: 1, labelId: 0 },
          { startEvent: 1, endEvent: 2, labelId: 1 },
        ],
      },
    ]);

    expect(metrics.events).toEqual({ correct: 1, total: 2, accuracy: 0.5 });
    expect(metrics.duration).toEqual({ correctTicks: 1, totalTicks: 4, accuracy: 0.25 });
    expect(metrics.segments).toEqual({
      correct: 0,
      predicted: 2,
      gold: 1,
      precision: 0,
      recall: 0,
      f1: 0,
    });
    expect(metrics.boundaries).toEqual({
      correct: 0,
      predicted: 1,
      gold: 0,
      precision: 0,
      recall: 0,
      f1: 0,
    });
    expect(metrics.density).toEqual({ predicted: 2, gold: 1, ratio: 2 });
  });
});
