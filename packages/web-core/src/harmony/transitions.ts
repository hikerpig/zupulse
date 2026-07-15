import type { ChordSymbolInput } from "./schemas";

const naturalPitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;

export function scoreHarmonyTransition(from: ChordSymbolInput, to: ChordSymbolInput): number {
  if (JSON.stringify(from) === JSON.stringify(to)) return 0;
  const motion = (pitchClass(to) - pitchClass(from) + 12) % 12;
  const motionCost = motion === 5 || motion === 7 ? -0.05 : -0.12;
  const complexityIncrease = Math.max(0, complexity(to) - complexity(from));
  return motionCost - complexityIncrease * 0.02;
}

function pitchClass(chord: ChordSymbolInput): number {
  return (naturalPitchClasses[chord.root.step] + chord.root.alter + 12) % 12;
}

function complexity(chord: ChordSymbolInput): number {
  return Number(chord.extension !== undefined) + chord.degrees.length;
}
