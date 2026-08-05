import { PdfOmrError } from "./errors";

export type ExactRational = {
  numerator: number;
  denominator: number;
};

export function normalizeRational(value: ExactRational): ExactRational {
  assertSafeInteger(value.numerator);
  assertSafeInteger(value.denominator);
  if (value.denominator === 0) invalidRational("denominator-zero");
  const sign = value.denominator < 0 ? -1 : 1;
  const numerator = value.numerator * sign;
  const denominator = value.denominator * sign;
  if (numerator === 0) return { numerator: 0, denominator: 1 };
  const divisor = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function addRational(left: ExactRational, right: ExactRational): ExactRational {
  const normalizedLeft = normalizeRational(left);
  const normalizedRight = normalizeRational(right);
  const denominator = safeLcm(normalizedLeft.denominator, normalizedRight.denominator);
  const numerator =
    BigInt(normalizedLeft.numerator) * BigInt(denominator / normalizedLeft.denominator) +
    BigInt(normalizedRight.numerator) * BigInt(denominator / normalizedRight.denominator);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || numerator < BigInt(Number.MIN_SAFE_INTEGER)) {
    invalidRational("addition-overflow");
  }
  return normalizeRational({ numerator: Number(numerator), denominator });
}

export function compareRational(left: ExactRational, right: ExactRational): -1 | 0 | 1 {
  const normalizedLeft = normalizeRational(left);
  const normalizedRight = normalizeRational(right);
  const leftValue = BigInt(normalizedLeft.numerator) * BigInt(normalizedRight.denominator);
  const rightValue = BigInt(normalizedRight.numerator) * BigInt(normalizedLeft.denominator);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function safeLcm(left: number, right: number): number {
  assertSafeInteger(left);
  assertSafeInteger(right);
  if (left <= 0 || right <= 0) invalidRational("lcm-non-positive");
  const value = BigInt(left / gcd(left, right)) * BigInt(right);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalidRational("lcm-overflow");
  return Number(value);
}

function gcd(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) invalidRational("unsafe-integer");
}

function invalidRational(reason: string): never {
  throw new PdfOmrError("DRAFT_VALIDATION_FAILED", "rational value cannot be represented exactly", {
    context: { reason },
  });
}
