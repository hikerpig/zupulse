import { normalizeRational, safeLcm, type ExactRational } from "./rational";

const maxDivisions = 250_000;

export function musicXmlDivisions(values: readonly ExactRational[]): number {
  let wholeNoteUnits = 4;
  for (const value of values) wholeNoteUnits = safeLcm(wholeNoteUnits, normalizeRational(value).denominator);
  const divisions = wholeNoteUnits / 4;
  if (!Number.isSafeInteger(divisions) || divisions <= 0 || divisions > maxDivisions) {
    throw new Error("musicxml-divisions-limit");
  }
  return divisions;
}

export function musicXmlDuration(value: ExactRational, divisions: number): number {
  const normalized = normalizeRational(value);
  const wholeNoteUnits = divisions * 4;
  if (wholeNoteUnits % normalized.denominator !== 0) throw new Error("inexact-musicxml-duration");
  const duration = normalized.numerator * (wholeNoteUnits / normalized.denominator);
  if (!Number.isSafeInteger(duration) || duration < 0) throw new Error("invalid-musicxml-duration");
  return duration;
}

export function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
