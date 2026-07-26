import { chordSymbolSchema, type ChordSymbolInput } from "./schemas";

export const PAPER_SEMI_CRF_LABEL_SIMPLIFICATION_VERSION = "generic-added-notes-v1" as const;
export const PAPER_SEMI_CRF_ENHARMONIC_NORMALIZATION_VERSION = "masada-bunescu-mode-spelling-v1" as const;
export const PAPER_SEMI_CRF_LABEL_MAPPING_VERSION =
  `${PAPER_SEMI_CRF_LABEL_SIMPLIFICATION_VERSION}+${PAPER_SEMI_CRF_ENHARMONIC_NORMALIZATION_VERSION}` as const;

export type PaperSemiCrfSupportedLabel = {
  id: number;
  referenceLabel: string;
  normalizedLabel: string;
  status: "supported";
  chord: ChordSymbolInput;
};

export type PaperSemiCrfUnsupportedLabel = {
  id: number;
  referenceLabel: string;
  normalizedLabel: string;
  status: "unsupported";
  reason: "unsupported-syntax" | "unsupported-chord-kind";
};

export type PaperSemiCrfLabel = PaperSemiCrfSupportedLabel | PaperSemiCrfUnsupportedLabel;

export type PaperSemiCrfLabelInventory = {
  mappingVersion: typeof PAPER_SEMI_CRF_LABEL_MAPPING_VERSION;
  simplificationVersion: typeof PAPER_SEMI_CRF_LABEL_SIMPLIFICATION_VERSION;
  enharmonicNormalizationVersion: typeof PAPER_SEMI_CRF_ENHARMONIC_NORMALIZATION_VERSION;
  labels: PaperSemiCrfLabel[];
};

const referenceLabelPattern = /^([A-G])(bb|##|b|#)?:(maj|min|dim|aug|ger|fr|it)(4|6|7)?$/;
const flatPreferredRoots = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const sharpPreferredRoots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B"] as const;
const naturalPitchClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function createPaperSemiCrfLabelInventory(referenceLabels: readonly string[]): PaperSemiCrfLabelInventory {
  const unique = new Map<string, string>();
  for (const candidate of referenceLabels) {
    const referenceLabel = candidate.trim();
    if (referenceLabel.length === 0) continue;
    const normalizedLabel = normalizePaperSemiCrfLabel(referenceLabel);
    if (!unique.has(normalizedLabel)) unique.set(normalizedLabel, referenceLabel);
  }
  const labels = [...unique].map(([normalizedLabel, referenceLabel], id) =>
    mapPaperSemiCrfLabel(id, referenceLabel, normalizedLabel),
  );
  return {
    mappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    simplificationVersion: PAPER_SEMI_CRF_LABEL_SIMPLIFICATION_VERSION,
    enharmonicNormalizationVersion: PAPER_SEMI_CRF_ENHARMONIC_NORMALIZATION_VERSION,
    labels,
  };
}

export function normalizePaperSemiCrfLabel(referenceLabel: string): string {
  const match = referenceLabelPattern.exec(referenceLabel);
  if (!match) return referenceLabel;
  const [, step, accidental = "", mode, extension = ""] = match;
  const pitchClass = mod12(naturalPitchClasses[step!]! + accidentalValue(accidental));
  const roots = mode === "min" || mode === "dim" ? sharpPreferredRoots : flatPreferredRoots;
  return `${roots[pitchClass]!}:${mode}${extension}`;
}

export function paperSemiCrfChordToLabel(chordInput: ChordSymbolInput): string {
  const chord = chordSymbolSchema.parse(chordInput);
  const mode = paperModeForChordKind(chord.kind);
  if (mode === undefined || chord.bass !== undefined) throw new Error("unsupported paper semi-CRF chord");
  const addFourth =
    chord.degrees.length === 1 &&
    chord.degrees[0]?.operation === "add" &&
    chord.degrees[0].value === 4 &&
    chord.degrees[0].alter === 0;
  if (chord.degrees.length > 0 && !addFourth) throw new Error("unsupported paper semi-CRF chord");
  if (addFourth && chord.extension !== undefined) throw new Error("unsupported paper semi-CRF chord");
  if (chord.extension !== undefined && chord.extension !== 6 && chord.extension !== 7) {
    throw new Error("unsupported paper semi-CRF chord");
  }
  return `${formatRoot(chord.root)}:${mode}${addFourth ? 4 : (chord.extension ?? "")}`;
}

function mapPaperSemiCrfLabel(id: number, referenceLabel: string, normalizedLabel: string): PaperSemiCrfLabel {
  const match = referenceLabelPattern.exec(normalizedLabel);
  if (!match) {
    return { id, referenceLabel, normalizedLabel, status: "unsupported", reason: "unsupported-syntax" };
  }
  const [, step, accidental = "", mode, extensionText] = match;
  if (mode === "ger" || mode === "fr" || mode === "it") {
    return { id, referenceLabel, normalizedLabel, status: "unsupported", reason: "unsupported-chord-kind" };
  }
  const extension = extensionText === undefined ? undefined : Number(extensionText);
  const chord = chordSymbolSchema.parse({
    root: { step, alter: accidentalValue(accidental) },
    kind: chordKindForPaperMode(mode!),
    ...(extension === 6 || extension === 7 ? { extension } : {}),
    degrees: extension === 4 ? [{ operation: "add", value: 4, alter: 0 }] : [],
  });
  return { id, referenceLabel, normalizedLabel, status: "supported", chord };
}

function paperModeForChordKind(kind: ChordSymbolInput["kind"]): "maj" | "min" | "dim" | "aug" | undefined {
  if (kind === "major") return "maj";
  if (kind === "minor") return "min";
  if (kind === "diminished") return "dim";
  if (kind === "augmented") return "aug";
  return undefined;
}

function chordKindForPaperMode(mode: string): ChordSymbolInput["kind"] {
  if (mode === "maj") return "major";
  if (mode === "min") return "minor";
  if (mode === "dim") return "diminished";
  if (mode === "aug") return "augmented";
  throw new Error("unsupported paper semi-CRF mode");
}

function accidentalValue(accidental: string): -2 | -1 | 0 | 1 | 2 {
  if (accidental === "bb") return -2;
  if (accidental === "b") return -1;
  if (accidental === "#") return 1;
  if (accidental === "##") return 2;
  return 0;
}

function formatRoot(root: ChordSymbolInput["root"]): string {
  return `${root.step}${root.alter === -2 ? "bb" : root.alter === -1 ? "b" : root.alter === 1 ? "#" : root.alter === 2 ? "##" : ""}`;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
