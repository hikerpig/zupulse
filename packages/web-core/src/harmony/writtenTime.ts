export type ScoreWrittenMoment = {
  measureIndex: number;
  offsetTicks: number;
};

export type SourceWrittenOffset = {
  measureIndex: number;
  divisions: number;
  offsetDivisions: number;
};

export type WrittenTimeMap = {
  ticksPerQuarter: number;
  toMoment(source: SourceWrittenOffset): ScoreWrittenMoment;
  toSource(moment: ScoreWrittenMoment, divisions: number): SourceWrittenOffset;
};

export type WrittenTimeMappingErrorCode = "invalid-source-offset" | "unrepresentable-source-time" | "unsafe-timebase";

export class WrittenTimeMappingError extends Error {
  constructor(readonly code: WrittenTimeMappingErrorCode) {
    super(code);
    this.name = "WrittenTimeMappingError";
  }
}

export function createWrittenTimeMap(divisionsValues: readonly number[]): WrittenTimeMap {
  if (divisionsValues.length === 0) throw new WrittenTimeMappingError("invalid-source-offset");
  const ticksPerQuarter = divisionsValues.reduce(
    (timebase, divisions) => lcm(timebase, requireDivisions(divisions)),
    1,
  );

  return {
    ticksPerQuarter,
    toMoment(source) {
      requireSourceOffset(source);
      const ticksPerDivision = exactQuotient(ticksPerQuarter, source.divisions);
      const offsetTicks = source.offsetDivisions * ticksPerDivision;
      if (!Number.isSafeInteger(offsetTicks)) throw new WrittenTimeMappingError("unsafe-timebase");
      return { measureIndex: source.measureIndex, offsetTicks };
    },
    toSource(moment, divisions) {
      requireMoment(moment);
      const normalizedDivisions = requireDivisions(divisions);
      const offsetDivisions = exactQuotient(moment.offsetTicks * normalizedDivisions, ticksPerQuarter);
      return { measureIndex: moment.measureIndex, divisions: normalizedDivisions, offsetDivisions };
    },
  };
}

function requireSourceOffset(source: SourceWrittenOffset): void {
  requireMoment({ measureIndex: source.measureIndex, offsetTicks: source.offsetDivisions });
  requireDivisions(source.divisions);
}

function requireMoment(moment: ScoreWrittenMoment): void {
  if (!Number.isSafeInteger(moment.measureIndex) || moment.measureIndex < 0) {
    throw new WrittenTimeMappingError("invalid-source-offset");
  }
  if (!Number.isSafeInteger(moment.offsetTicks) || moment.offsetTicks < 0) {
    throw new WrittenTimeMappingError("invalid-source-offset");
  }
}

function requireDivisions(divisions: number): number {
  if (!Number.isSafeInteger(divisions) || divisions <= 0) throw new WrittenTimeMappingError("invalid-source-offset");
  return divisions;
}

function lcm(left: number, right: number): number {
  const reduced = left / gcd(left, right);
  if (reduced > Number.MAX_SAFE_INTEGER / right) throw new WrittenTimeMappingError("unsafe-timebase");
  return reduced * right;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function exactQuotient(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator % denominator !== 0) {
    throw new WrittenTimeMappingError("unrepresentable-source-time");
  }
  return numerator / denominator;
}
