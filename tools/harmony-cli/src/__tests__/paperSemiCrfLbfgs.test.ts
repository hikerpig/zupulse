import { describe, expect, it } from "vitest";
import { minimizeWithPaperSemiCrfLbfgs } from "../paperSemiCrfLbfgs";

function quadratic(weights: readonly number[]) {
  const dx = weights[0]! - 3;
  const dy = weights[1]! + 2;
  return {
    value: 0.5 * dx * dx + 2 * dy * dy,
    gradient: [dx, 4 * dy],
  };
}

describe("paper Semi-CRF L-BFGS", () => {
  it("converges deterministically on a positive-definite quadratic", () => {
    const first = minimizeWithPaperSemiCrfLbfgs({
      initialWeights: [10, 10],
      evaluate: quadratic,
      maxIterations: 50,
      gradientTolerance: 1e-9,
    });
    const second = minimizeWithPaperSemiCrfLbfgs({
      initialWeights: [10, 10],
      evaluate: quadratic,
      maxIterations: 50,
      gradientTolerance: 1e-9,
    });

    expect(first.status).toBe("converged");
    expect(first.weights[0]).toBeCloseTo(3, 8);
    expect(first.weights[1]).toBeCloseTo(-2, 8);
    expect(first).toEqual(second);
  });

  it("resumes to the same state as an uninterrupted iteration budget", () => {
    const partial = minimizeWithPaperSemiCrfLbfgs({
      initialWeights: [10, 10],
      evaluate: quadratic,
      maxIterations: 2,
      gradientTolerance: 0,
    });
    const resumed = minimizeWithPaperSemiCrfLbfgs({
      resume: partial.checkpoint,
      evaluate: quadratic,
      maxIterations: 3,
      gradientTolerance: 0,
    });
    const uninterrupted = minimizeWithPaperSemiCrfLbfgs({
      initialWeights: [10, 10],
      evaluate: quadratic,
      maxIterations: 5,
      gradientTolerance: 0,
    });

    expect(resumed.checkpoint).toEqual(uninterrupted.checkpoint);
  });

  it("rejects non-finite objective values and gradients", () => {
    expect(() =>
      minimizeWithPaperSemiCrfLbfgs({
        initialWeights: [0],
        evaluate: () => ({ value: Number.NaN, gradient: [0] }),
        maxIterations: 1,
      }),
    ).toThrow("non-finite L-BFGS objective");
    expect(() =>
      minimizeWithPaperSemiCrfLbfgs({
        initialWeights: [0],
        evaluate: () => ({ value: 0, gradient: [Number.POSITIVE_INFINITY] }),
        maxIterations: 1,
      }),
    ).toThrow("non-finite L-BFGS gradient");
  });
});
