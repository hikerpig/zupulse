export type PaperSemiCrfObjectiveEvaluation = {
  value: number;
  gradient: number[];
};

type LbfgsHistoryEntry = {
  step: number[];
  gradientDelta: number[];
  inverseCurvature: number;
};

export type PaperSemiCrfLbfgsCheckpoint = {
  schemaVersion: "paper-semi-crf-lbfgs-checkpoint-v1";
  iteration: number;
  weights: number[];
  value: number;
  gradient: number[];
  history: LbfgsHistoryEntry[];
};

export type PaperSemiCrfLbfgsResult = {
  status: "converged" | "max-iterations";
  iterations: number;
  weights: number[];
  value: number;
  gradient: number[];
  checkpoint: PaperSemiCrfLbfgsCheckpoint;
};

type PaperSemiCrfLbfgsInput = {
  evaluate(weights: readonly number[]): PaperSemiCrfObjectiveEvaluation;
  maxIterations: number;
  historySize?: number;
  gradientTolerance?: number;
} & (
  | { initialWeights: readonly number[]; resume?: never }
  | { initialWeights?: never; resume: PaperSemiCrfLbfgsCheckpoint }
);

export function minimizeWithPaperSemiCrfLbfgs(input: PaperSemiCrfLbfgsInput): PaperSemiCrfLbfgsResult {
  const historySize = input.historySize ?? 10;
  const gradientTolerance = input.gradientTolerance ?? 1e-5;
  validateOptions(input.maxIterations, historySize, gradientTolerance);

  let iteration: number;
  let weights: number[];
  let evaluation: PaperSemiCrfObjectiveEvaluation;
  let history: LbfgsHistoryEntry[];
  if (input.resume) {
    validateCheckpoint(input.resume);
    iteration = input.resume.iteration;
    weights = [...input.resume.weights];
    evaluation = { value: input.resume.value, gradient: [...input.resume.gradient] };
    history = input.resume.history.map((entry) => ({
      step: [...entry.step],
      gradientDelta: [...entry.gradientDelta],
      inverseCurvature: entry.inverseCurvature,
    }));
  } else {
    weights = [...input.initialWeights];
    if (weights.length === 0 || weights.some((weight) => !Number.isFinite(weight))) {
      throw new Error("invalid L-BFGS initial weights");
    }
    iteration = 0;
    evaluation = input.evaluate(weights);
    validateEvaluation(evaluation, weights.length);
    history = [];
  }

  const targetIteration = iteration + input.maxIterations;
  while (iteration < targetIteration && infinityNorm(evaluation.gradient) > gradientTolerance) {
    let direction = twoLoopDirection(evaluation.gradient, history);
    if (dot(direction, evaluation.gradient) >= 0) direction = evaluation.gradient.map((value) => -value);
    const next = lineSearch(input.evaluate, weights, evaluation, direction);
    const step = subtract(next.weights, weights);
    const gradientDelta = subtract(next.evaluation.gradient, evaluation.gradient);
    const curvature = dot(step, gradientDelta);
    if (curvature > 1e-12 * euclideanNorm(step) * euclideanNorm(gradientDelta)) {
      history.push({ step, gradientDelta, inverseCurvature: 1 / curvature });
      if (history.length > historySize) history.shift();
    }
    weights = next.weights;
    evaluation = next.evaluation;
    iteration += 1;
  }

  const checkpoint: PaperSemiCrfLbfgsCheckpoint = {
    schemaVersion: "paper-semi-crf-lbfgs-checkpoint-v1",
    iteration,
    weights: [...weights],
    value: evaluation.value,
    gradient: [...evaluation.gradient],
    history: history.map((entry) => ({
      step: [...entry.step],
      gradientDelta: [...entry.gradientDelta],
      inverseCurvature: entry.inverseCurvature,
    })),
  };
  return {
    status: infinityNorm(evaluation.gradient) <= gradientTolerance ? "converged" : "max-iterations",
    iterations: iteration,
    weights: [...weights],
    value: evaluation.value,
    gradient: [...evaluation.gradient],
    checkpoint,
  };
}

function twoLoopDirection(gradient: readonly number[], history: readonly LbfgsHistoryEntry[]): number[] {
  const result = [...gradient];
  const alphas = Array.from({ length: history.length }, () => 0);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]!;
    const alpha = entry.inverseCurvature * dot(entry.step, result);
    alphas[index] = alpha;
    addScaled(result, entry.gradientDelta, -alpha);
  }
  const latest = history.at(-1);
  if (latest) {
    const scale = dot(latest.step, latest.gradientDelta) / dot(latest.gradientDelta, latest.gradientDelta);
    for (let index = 0; index < result.length; index += 1) result[index]! *= scale;
  }
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index]!;
    const beta = entry.inverseCurvature * dot(entry.gradientDelta, result);
    addScaled(result, entry.step, alphas[index]! - beta);
  }
  return result.map((value) => -value);
}

function lineSearch(
  evaluate: (weights: readonly number[]) => PaperSemiCrfObjectiveEvaluation,
  weights: readonly number[],
  current: PaperSemiCrfObjectiveEvaluation,
  direction: readonly number[],
): { weights: number[]; evaluation: PaperSemiCrfObjectiveEvaluation } {
  const directionalDerivative = dot(current.gradient, direction);
  let stepSize = 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = weights.map((weight, index) => weight + stepSize * direction[index]!);
    const evaluation = evaluate(candidate);
    validateEvaluation(evaluation, weights.length);
    if (evaluation.value <= current.value + 1e-4 * stepSize * directionalDerivative) {
      return { weights: candidate, evaluation };
    }
    stepSize *= 0.5;
  }
  throw new Error("L-BFGS line search failed");
}

function validateOptions(maxIterations: number, historySize: number, gradientTolerance: number): void {
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 0) {
    throw new Error("L-BFGS maxIterations must be a nonnegative integer");
  }
  if (!Number.isSafeInteger(historySize) || historySize < 1) {
    throw new Error("L-BFGS historySize must be a positive integer");
  }
  if (!Number.isFinite(gradientTolerance) || gradientTolerance < 0) {
    throw new Error("L-BFGS gradientTolerance must be nonnegative");
  }
}

function validateCheckpoint(checkpoint: PaperSemiCrfLbfgsCheckpoint): void {
  if (
    checkpoint.schemaVersion !== "paper-semi-crf-lbfgs-checkpoint-v1" ||
    !Number.isSafeInteger(checkpoint.iteration) ||
    checkpoint.iteration < 0 ||
    checkpoint.weights.length === 0 ||
    checkpoint.gradient.length !== checkpoint.weights.length
  ) {
    throw new Error("invalid L-BFGS checkpoint");
  }
  validateEvaluation({ value: checkpoint.value, gradient: checkpoint.gradient }, checkpoint.weights.length);
  if (checkpoint.weights.some((weight) => !Number.isFinite(weight))) throw new Error("invalid L-BFGS checkpoint");
  for (const entry of checkpoint.history) {
    if (
      entry.step.length !== checkpoint.weights.length ||
      entry.gradientDelta.length !== checkpoint.weights.length ||
      entry.step.some((value) => !Number.isFinite(value)) ||
      entry.gradientDelta.some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(entry.inverseCurvature) ||
      entry.inverseCurvature <= 0
    ) {
      throw new Error("invalid L-BFGS checkpoint");
    }
  }
}

function validateEvaluation(evaluation: PaperSemiCrfObjectiveEvaluation, expectedLength: number): void {
  if (!Number.isFinite(evaluation.value)) throw new Error("non-finite L-BFGS objective");
  if (
    evaluation.gradient.length !== expectedLength ||
    evaluation.gradient.some((component) => !Number.isFinite(component))
  ) {
    throw new Error("non-finite L-BFGS gradient");
  }
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}

function addScaled(target: number[], source: readonly number[], scale: number): void {
  for (let index = 0; index < target.length; index += 1) target[index]! += scale * source[index]!;
}

function subtract(left: readonly number[], right: readonly number[]): number[] {
  return left.map((value, index) => value - right[index]!);
}

function infinityNorm(values: readonly number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}

function euclideanNorm(values: readonly number[]): number {
  return Math.sqrt(dot(values, values));
}
