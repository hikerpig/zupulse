import {
  chordSymbolSchema,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenRange,
} from "@zupulse/web-core";

const TICKS_PER_QUARTER = 480;
type Row = Record<string, string>;
type MeasurePosition = { index: number; startQuarterbeats: number; durationQuarterbeats: number };

export type DcmlGold = {
  range: ScoreWrittenRange;
  label: string;
  family: string;
  weight: number;
  chord?: ChordSymbolInput;
  unsupportedLabel?: string;
};

export type DcmlPiece = { corpus: string; groupId: string; input: HarmonyAnalysisInput; gold: DcmlGold[] };

export function parseDcmlPiece(source: {
  corpus: string;
  groupId: string;
  measures: string;
  notes: string;
  harmonies: string;
}): DcmlPiece {
  const measureRows = parseTsv(source.measures);
  const positions = measureRows.map((row, index) => ({
    index,
    startQuarterbeats: quarterbeats(row),
    durationQuarterbeats: number(row, "duration_qb"),
  }));
  const measures = measureRows.map((row, index) => {
    const [numerator, denominator] = required(row, "timesig").split("/").map(Number);
    if (!numerator || !denominator) throw new Error(`invalid DCML timesig: ${row.timesig}`);
    return {
      index,
      durationTicks: Math.max(1, Math.round(number(row, "duration_qb") * TICKS_PER_QUARTER)),
      timeSignature: { numerator, denominator },
      key: `fifths:${number(row, "keysig")}`,
    };
  });
  const notesByStaff = Map.groupBy(parseTsv(source.notes), (row) => number(row, "staff"));
  const staves = [...notesByStaff.entries()]
    .sort(([a], [b]) => a - b)
    .map(([staff, rows]) => ({
      index: staff - 1,
      notes: rows.map((row, index) => {
        const tpc = number(row, "tpc");
        const durationQuarterbeats = number(row, "duration_qb");
        const grace = (row.gracenote ?? "") !== "" || durationQuarterbeats === 0;
        const durationTicks = grace
          ? Math.max(1, Math.round(parseFraction(required(row, "nominal_duration")) * 4 * TICKS_PER_QUARTER))
          : Math.max(1, Math.round(durationQuarterbeats * TICKS_PER_QUARTER));
        return {
          id: `${source.groupId}:${staff}:${index}`,
          moment: momentAtQuarterbeat(quarterbeats(row), positions),
          durationTicks,
          soundingPitchClass: modulo(tpc * 7, 12),
          soundingMidi: number(row, "midi"),
          spelling: pitchFromFifths(tpc),
          voice: Math.max(1, number(row, "voice")),
          ...(grace ? { grace: true } : {}),
        };
      }),
    }));
  const harmonyRows = parseTsv(source.harmonies).sort((a, b) => quarterbeats(a) - quarterbeats(b));
  const scoreEndQuarterbeats = positions.reduce(
    (end, position) => Math.max(end, position.startQuarterbeats + position.durationQuarterbeats),
    0,
  );
  const gold = harmonyRows.map((row, index) => {
    const startQuarterbeats = quarterbeats(row);
    const nextQuarterbeats = harmonyRows
      .slice(index + 1)
      .map(quarterbeats)
      .find((onset) => onset > startQuarterbeats);
    const durationQuarterbeats = (nextQuarterbeats ?? scoreEndQuarterbeats) - startQuarterbeats;
    const endQuarterbeats = startQuarterbeats + durationQuarterbeats;
    const canonical = canonicalizeDcmlHarmony(row);
    return {
      range: {
        start: momentAtQuarterbeat(startQuarterbeats, positions),
        end: momentAtQuarterbeat(endQuarterbeats, positions),
      },
      label: required(row, "label"),
      family: canonical.family,
      weight: Math.max(1, Math.round(durationQuarterbeats * TICKS_PER_QUARTER)),
      ...(canonical.chord ? { chord: canonical.chord } : { unsupportedLabel: required(row, "label") }),
    };
  });

  return {
    corpus: source.corpus,
    groupId: source.groupId,
    input: createHarmonyAnalysisInput({
      ticksPerQuarter: TICKS_PER_QUARTER,
      measures,
      tracks: [{ id: "dcml", name: `${source.corpus} ${source.groupId}`, isPercussion: false, staves }],
    }),
    gold,
  };
}

function canonicalizeDcmlHarmony(row: Row): { family: string; chord?: ChordSymbolInput } {
  const type = required(row, "chord_type", false);
  if (["Ger", "Fr", "It"].includes(type)) return { family: "augmented-sixth" };
  if (required(row, "changes", false) !== "") return { family: "altered" };
  const shape = chordShape(type);
  if (!shape) return { family: "unsupported" };
  try {
    const localTonic = localKeyTonic(required(row, "globalkey"), required(row, "localkey"));
    const rootFifths = localTonic + number(row, "root");
    const bassFifths = localTonic + number(row, "bass_note");
    return {
      family: shape.extension === undefined ? "triad" : shape.extension > 7 ? "extended" : "seventh",
      chord: chordSymbolSchema.parse({
        root: pitchFromFifths(rootFifths),
        kind: shape.kind,
        ...(shape.extension === undefined ? {} : { extension: shape.extension }),
        degrees: [],
        ...(bassFifths === rootFifths ? {} : { bass: pitchFromFifths(bassFifths) }),
      }),
    };
  } catch {
    return { family: "unsupported" };
  }
}

function chordShape(
  type: string,
): { kind: ChordSymbolInput["kind"]; extension?: ChordSymbolInput["extension"] } | null {
  switch (type) {
    case "M":
      return { kind: "major" };
    case "m":
      return { kind: "minor" };
    case "o":
      return { kind: "diminished" };
    case "+":
      return { kind: "augmented" };
    case "MM7":
      return { kind: "major", extension: 7 };
    case "Mm7":
      return { kind: "dominant", extension: 7 };
    case "mm7":
      return { kind: "minor", extension: 7 };
    case "o7":
      return { kind: "diminished", extension: 7 };
    case "%7":
      return { kind: "half-diminished", extension: 7 };
    case "+7":
      return { kind: "augmented", extension: 7 };
    default:
      return null;
  }
}

function localKeyTonic(globalKey: string, localKey: string): number {
  const match = /^([A-Ga-g])([#b]*)$/.exec(globalKey);
  const roman = /^([#b]*)(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)$/.exec(localKey);
  if (!match || !roman) throw new Error("unsupported DCML key");
  const globalTonic = naturalFifths(match[1]!.toUpperCase()) + accidentalFifths(match[2]!);
  const degree = ["I", "II", "III", "IV", "V", "VI", "VII"].indexOf(roman[2]!.toUpperCase());
  const intervals = match[1] === match[1]!.toLowerCase() ? [0, 2, -3, -1, 1, -4, -2] : [0, 2, 4, -1, 1, 3, 5];
  return globalTonic + intervals[degree]! + accidentalFifths(roman[1]!);
}

function pitchFromFifths(fifths: number): {
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter: -2 | -1 | 0 | 1 | 2;
} {
  const steps = ["C", "G", "D", "A", "E", "B", "F"] as const;
  const bases = [0, 1, 2, 3, 4, 5, -1];
  const index = modulo(fifths, 7);
  const alter = (fifths - bases[index]!) / 7;
  if (![-2, -1, 0, 1, 2].includes(alter)) throw new Error(`unsupported spelling fifths: ${fifths}`);
  return { step: steps[index]!, alter: alter as -2 | -1 | 0 | 1 | 2 };
}

function naturalFifths(step: string): number {
  const value = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 }[step];
  if (value === undefined) throw new Error(`invalid pitch step: ${step}`);
  return value;
}

function accidentalFifths(accidentals: string): number {
  return [...accidentals].reduce((sum, accidental) => sum + (accidental === "#" ? 7 : -7), 0);
}

function momentAtQuarterbeat(quarterbeat: number, measures: readonly MeasurePosition[]) {
  const position =
    measures.find(
      (measure) =>
        quarterbeat >= measure.startQuarterbeats &&
        quarterbeat < measure.startQuarterbeats + measure.durationQuarterbeats,
    ) ?? measures.at(-1);
  if (!position) throw new Error("DCML piece has no measures");
  return {
    measureIndex: position.index,
    offsetTicks: Math.round((quarterbeat - position.startQuarterbeats) * TICKS_PER_QUARTER),
  };
}

export function parseTsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split("\t") ?? [];
  return lines.map((line) => Object.fromEntries(header.map((name, index) => [name, line.split("\t")[index] ?? ""])));
}

function required(row: Row, field: string, nonempty = true): string {
  const value = row[field];
  if (value === undefined || (nonempty && value === "")) throw new Error(`missing DCML field: ${field}`);
  return value;
}

function number(row: Row, field: string): number {
  const value = parseFraction(required(row, field));
  if (!Number.isFinite(value)) throw new Error(`invalid DCML number: ${field}`);
  return value;
}

function quarterbeats(row: Row): number {
  const allEndings = row.quarterbeats_all_endings;
  return parseFraction(allEndings ? allEndings : required(row, "quarterbeats"));
}

function parseFraction(value: string): number {
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator === undefined ? numerator! : numerator! / denominator;
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
