import {
  chordSymbolSchema,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenMoment,
} from "@zupulse/web-core";
import { parseStandardMidi } from "./midi";

const TICKS_PER_BEAT = 480;
type Grid = { times: number[] };

export type Pop909Piece = {
  corpus: string;
  groupId: string;
  input: HarmonyAnalysisInput;
  gold: Array<{
    range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment };
    label: string;
    family: string;
    weight: number;
    chord?: ChordSymbolInput;
    unsupportedLabel?: string;
  }>;
};

export function parsePop909Piece(source: {
  corpus: string;
  groupId: string;
  midi: Uint8Array;
  beats: string;
  chords: string;
}): Pop909Piece {
  const notes = parseStandardMidi(source.midi).filter((note) => note.channel !== 9);
  const chordRows = source.chords
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [start, end, label] = line.trim().split(/\s+/);
      if (!start || !end || !label) throw new Error(`invalid POP909 chord row: ${line}`);
      return { start: Number(start) * 1000, end: Number(end) * 1000, label };
    });
  const beatTimes = source.beats
    .trim()
    .split(/\r?\n/)
    .map((line) => Number(line.trim().split(/\s+/)[0]) * 1000)
    .filter(Number.isFinite);
  const maxEnd = Math.max(...notes.map((note) => note.endMs), ...chordRows.map((row) => row.end));
  const times = [...new Set(beatTimes)].sort((a, b) => a - b);
  if (times.length === 0) throw new Error("POP909 piece has no beat grid");
  if (times[0]! > 0) times.unshift(0);
  if (times.at(-1)! < maxEnd) times.push(maxEnd);
  const grid = { times };
  const measures = times.slice(0, -1).map((_, index) => ({
    index,
    durationTicks: TICKS_PER_BEAT,
    timeSignature: { numerator: 1, denominator: 4 },
    key: "unknown",
  }));
  const projectedNotes = notes.flatMap((note, index) => {
    const start = globalTickAt(note.startMs, grid);
    const end = globalTickAt(note.endMs, grid);
    if (end <= start) return [];
    return [
      {
        id: `${source.groupId}:${index}`,
        moment: momentAtGlobalTick(start, measures.length),
        durationTicks: Math.max(1, end - start),
        soundingPitchClass: modulo(note.midi, 12),
        soundingMidi: note.midi,
        spelling: pitchFromMidi(note.midi),
        voice: note.channel + 1,
      },
    ];
  });
  const gold = chordRows.map((row) => {
    let chord: ChordSymbolInput | null = null;
    let supported = true;
    try {
      chord = parsePop909Chord(row.label);
    } catch {
      supported = false;
    }
    return {
      range: {
        start: momentAtGlobalTick(globalTickAt(row.start, grid), measures.length),
        end: momentAtGlobalTick(globalTickAt(row.end, grid), measures.length),
      },
      label: row.label,
      family: supported ? pop909Family(chord) : "unsupported",
      weight: Math.max(1, Math.round(row.end - row.start)),
      ...(chord ? { chord } : { unsupportedLabel: row.label }),
    };
  });
  return {
    corpus: source.corpus,
    groupId: source.groupId,
    input: createHarmonyAnalysisInput({
      ticksPerQuarter: TICKS_PER_BEAT,
      measures,
      tracks: [
        {
          id: "pop909",
          name: `POP909 ${source.groupId}`,
          isPercussion: false,
          staves: [{ index: 0, notes: projectedNotes }],
        },
      ],
    }),
    gold,
  };
}

export function parsePop909Chord(label: string): ChordSymbolInput | null {
  if (label === "N") return null;
  const match = /^([A-G])([#b]?):([^/]+)(?:\/(b?\d))?$/.exec(label);
  if (!match) throw new Error(`unsupported POP909 chord: ${label}`);
  const root = pitchName(match[1]!, match[2]!);
  const shape = pop909Shape(match[3]!);
  const bass = match[4] ? transposeDegree(root, match[4]!) : undefined;
  return chordSymbolSchema.parse({
    root,
    ...shape,
    degrees: [],
    ...(bass && (bass.step !== root.step || bass.alter !== root.alter) ? { bass } : {}),
  });
}

function pop909Shape(quality: string): { kind: ChordSymbolInput["kind"]; extension?: ChordSymbolInput["extension"] } {
  const shapes: Record<string, { kind: ChordSymbolInput["kind"]; extension?: ChordSymbolInput["extension"] }> = {
    maj: { kind: "major" },
    min: { kind: "minor" },
    "7": { kind: "dominant", extension: 7 },
    maj6: { kind: "major", extension: 6 },
    min6: { kind: "minor", extension: 6 },
    maj7: { kind: "major", extension: 7 },
    min7: { kind: "minor", extension: 7 },
    dim: { kind: "diminished" },
    dim7: { kind: "diminished", extension: 7 },
    hdim7: { kind: "half-diminished", extension: 7 },
    aug: { kind: "augmented" },
    sus2: { kind: "suspended-second" },
    sus4: { kind: "suspended-fourth" },
    "sus4(b7)": { kind: "suspended-fourth", extension: 7 },
  };
  const shape = shapes[quality];
  if (!shape) throw new Error(`unsupported POP909 quality: ${quality}`);
  return shape;
}

function transposeDegree(root: ReturnType<typeof pitchName>, degree: string) {
  const flat = degree.startsWith("b");
  const value = Number(flat ? degree.slice(1) : degree);
  const stepNames = ["C", "D", "E", "F", "G", "A", "B"] as const;
  const naturalPitchClasses = [0, 2, 4, 5, 7, 9, 11];
  const rootIndex = stepNames.indexOf(root.step);
  const targetIndex = modulo(rootIndex + value - 1, 7);
  const intervals = [0, 2, 4, 5, 7, 9, 11];
  const targetPitchClass = modulo(pitchClass(root) + intervals[value - 1]! - Number(flat), 12);
  const natural = naturalPitchClasses[targetIndex]!;
  let alter = modulo(targetPitchClass - natural + 6, 12) - 6;
  if (alter < -2 || alter > 2) throw new Error(`unsupported POP909 bass spelling: ${degree}`);
  return { step: stepNames[targetIndex]!, alter: alter as -2 | -1 | 0 | 1 | 2 };
}

function pitchName(step: string, accidental: string) {
  return {
    step: step as "A" | "B" | "C" | "D" | "E" | "F" | "G",
    alter: (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) as -1 | 0 | 1,
  };
}

function pitchClass(pitch: { step: string; alter: number }): number {
  return modulo({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[pitch.step as "A"] + pitch.alter, 12);
}

function pitchFromMidi(midi: number) {
  const names = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ] as const;
  return names[modulo(midi, 12)]!;
}

function globalTickAt(timeMs: number, grid: Grid): number {
  const nextIndex = grid.times.findIndex((time) => time > timeMs);
  const safeIndex = nextIndex < 0 ? grid.times.length - 2 : Math.max(0, nextIndex - 1);
  const start = grid.times[safeIndex]!;
  const end = grid.times[safeIndex + 1]!;
  return Math.round((safeIndex + (timeMs - start) / Math.max(1, end - start)) * TICKS_PER_BEAT);
}

function momentAtGlobalTick(tick: number, measureCount: number): ScoreWrittenMoment {
  const measureIndex = Math.min(measureCount - 1, Math.floor(tick / TICKS_PER_BEAT));
  return { measureIndex, offsetTicks: tick - measureIndex * TICKS_PER_BEAT };
}

function pop909Family(chord: ChordSymbolInput | null): string {
  if (!chord) return "no-chord";
  if (chord.bass) return "inversion";
  return chord.extension === undefined ? "triad" : "seventh";
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
