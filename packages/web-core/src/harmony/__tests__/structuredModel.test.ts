import { describe, expect, it } from "vitest";
import {
  createZeroHarmonyStructuredLinearModel,
  harmonyStructuredLinearModelSchema,
  scoreStructuredSegment,
  scoreStructuredTransition,
  STRUCTURED_SEGMENT_FEATURE_LENGTH,
  STRUCTURED_TRANSITION_FEATURE_LENGTH,
} from "../structuredModel";

describe("structured linear harmony model", () => {
  it("creates a strict zero model that preserves rule scores", () => {
    const model = createZeroHarmonyStructuredLinearModel({
      trainingRecordsSha256: "a".repeat(64),
      trainingGroupsSha256: "b".repeat(64),
    });

    expect(harmonyStructuredLinearModelSchema.parse(model)).toEqual(model);
    expect(scoreStructuredSegment(model, Array(STRUCTURED_SEGMENT_FEATURE_LENGTH).fill(1))).toBe(0);
    expect(scoreStructuredTransition(model, Array(STRUCTURED_TRANSITION_FEATURE_LENGTH).fill(1))).toBe(0);
  });

  it("scores fixed-order segment and transition vectors independently", () => {
    const model = createZeroHarmonyStructuredLinearModel({
      trainingRecordsSha256: "a".repeat(64),
      trainingGroupsSha256: "b".repeat(64),
    });
    model.segmentWeights[0] = 0.25;
    model.transitionWeights[1] = -0.5;

    expect(scoreStructuredSegment(model, [2, ...Array(STRUCTURED_SEGMENT_FEATURE_LENGTH - 1).fill(0)])).toBe(0.5);
    expect(scoreStructuredTransition(model, [0, 4, ...Array(STRUCTURED_TRANSITION_FEATURE_LENGTH - 2).fill(0)])).toBe(
      -2,
    );
  });

  it("rejects incompatible versions, lengths, and non-quantized weights", () => {
    const model = createZeroHarmonyStructuredLinearModel({
      trainingRecordsSha256: "a".repeat(64),
      trainingGroupsSha256: "b".repeat(64),
    });

    expect(() => harmonyStructuredLinearModelSchema.parse({ ...model, featureVersion: "future" })).toThrow();
    expect(() => harmonyStructuredLinearModelSchema.parse({ ...model, segmentWeights: [0] })).toThrow();
    expect(() =>
      harmonyStructuredLinearModelSchema.parse({
        ...model,
        segmentWeights: [0.001, ...model.segmentWeights.slice(1)],
      }),
    ).toThrow();
  });
});
