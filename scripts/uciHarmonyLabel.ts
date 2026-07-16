import { chordSymbolSchema, type ChordSymbolInput } from "../packages/web-core/src/harmony/schemas";

const pitchClassByStep = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
type PitchStep = keyof typeof pitchClassByStep;

export function parseUciHarmonyLabel(label: string): ReturnType<typeof chordSymbolSchema.parse> | null {
  const match = /^([A-G](?:#|b)?)(?:_)?([Mmd])([467])?$/.exec(label);
  if (!match) return null;
  const figure = match[3] === undefined ? undefined : Number(match[3]);
  const quality = match[2]!;
  const kind: ChordSymbolInput["kind"] =
    quality === "d" ? "diminished" : quality === "m" ? "minor" : figure === 7 ? "dominant" : "major";
  const root = pitchNameToPitch(match[1]!);
  return chordSymbolSchema.parse({
    root: { step: root.step, alter: root.alter },
    kind,
    degrees: figure === 4 ? [{ operation: "add", value: 4, alter: 0 }] : [],
    ...(figure === 6 || figure === 7 ? { extension: figure } : {}),
  });
}

export function matchesUciHarmonyLabel(actual: ChordSymbolInput, expected: ChordSymbolInput): boolean {
  return (
    JSON.stringify(actual.root) === JSON.stringify(expected.root) &&
    actual.kind === expected.kind &&
    actual.extension === expected.extension &&
    JSON.stringify(actual.degrees) === JSON.stringify(expected.degrees)
  );
}

export function pitchNameToPitch(name: string): { step: PitchStep; alter: number; pitchClass: number } {
  const step = name.slice(0, 1) as PitchStep;
  const alter = name.endsWith("#") ? 1 : name.endsWith("b") ? -1 : 0;
  return { step, alter, pitchClass: (pitchClassByStep[step] + alter + 12) % 12 };
}

export function chordBassPitchClass(chord: ChordSymbolInput): number {
  const pitch = chord.bass ?? chord.root;
  return (pitchClassByStep[pitch.step] + pitch.alter + 12) % 12;
}
