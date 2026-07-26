import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "./paper-semi-crf-events";
import type { PaperSemiCrfSupportedLabel } from "./paper-semi-crf-labels";
import type { PaperSemiCrfSegment } from "./paper-semi-crf-model";

type FeatureWeight = "count" | "accent" | "duration";

type ChordRoles = {
  root: readonly number[];
  third: readonly number[];
  fifth: readonly number[];
  added: readonly number[];
};

export function extractPaperSemiCrfSegmentFeatures(input: {
  events: readonly PaperSemiCrfEvent[];
  segment: PaperSemiCrfSegment;
  label: PaperSemiCrfSupportedLabel;
}): string[] {
  if (
    input.segment.labelId !== input.label.id ||
    input.segment.startEvent < 0 ||
    input.segment.endEvent > input.events.length ||
    input.segment.startEvent >= input.segment.endEvent
  ) {
    throw new Error("invalid paper semi-CRF feature segment");
  }
  const events = input.events.slice(input.segment.startEvent, input.segment.endEvent);
  const notes = notesInSegment(events);
  const roles = chordRoles(input.label);
  const chordPitchClasses = new Set([...roles.root, ...roles.third, ...roles.fifth, ...roles.added]);
  const features = [
    `PURITY_${purityBin(notes, events, chordPitchClasses, "count")}`,
    `ACCENTED_PURITY_${purityBin(notes, events, chordPitchClasses, "accent")}`,
    `DURATION_PURITY_${purityBin(notes, events, chordPitchClasses, "duration")}`,
  ];
  const rootCovered = coversRole(notes, roles.root);
  const thirdCovered = coversRole(notes, roles.third);
  const fifthCovered = coversRole(notes, roles.fifth);
  const addedCovered = coversRole(notes, roles.added);
  if (rootCovered) features.push("ROOT_COVERED");
  if (thirdCovered) features.push("THIRD_COVERED");
  if (fifthCovered) features.push("FIFTH_COVERED");
  if (roles.added.length > 0) {
    features.push(addedCovered ? "ADDED_NOTE_COVERED" : "ADDED_NOTE_NOT_COVERED");
  }
  if (rootCovered && thirdCovered && fifthCovered && (roles.added.length === 0 || addedCovered)) {
    features.push("ALL_NOTES_COVERED");
  }
  features.push(`BEGINNING_ACCENTED_${formatReferenceDouble(events[0]!.metricAccent)}`);
  return features;
}

export function paperSemiCrfConsistencyBin(input: {
  matching: number;
  total: number;
  matchedCount: number;
  noteCount: number;
}): number {
  if (input.matchedCount === 0) return 0;
  if (input.matchedCount === input.noteCount) return 101;
  const percentage = input.matching / input.total;
  const bins = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const bin of bins) {
    if (percentage <= bin) return bin * 100;
  }
  return 0;
}

function purityBin(
  notes: readonly PaperSemiCrfEventNote[],
  events: readonly PaperSemiCrfEvent[],
  chordPitchClasses: ReadonlySet<number>,
  weight: FeatureWeight,
): number {
  let total = 0;
  let matching = 0;
  let matchedCount = 0;
  for (const note of notes) {
    const value = noteWeight(note, events[0]!, weight);
    total += value;
    if (chordPitchClasses.has(note.soundingPitchClass)) {
      matching += value;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({ matching, total, matchedCount, noteCount: notes.length });
}

function notesInSegment(events: readonly PaperSemiCrfEvent[]): PaperSemiCrfEventNote[] {
  return events.flatMap((event, index) => event.notes.filter((note) => index === 0 || !note.heldFromPrevious));
}

function noteWeight(note: PaperSemiCrfEventNote, firstEvent: PaperSemiCrfEvent, weight: FeatureWeight): number {
  if (weight === "count") return 1;
  if (weight === "accent") return note.heldFromPrevious ? 0 : note.metricAccent;
  return note.heldFromPrevious
    ? note.sourceDurationTicks - (firstEvent.startTick - note.onsetTick)
    : note.sourceDurationTicks;
}

function coversRole(notes: readonly PaperSemiCrfEventNote[], role: readonly number[]): boolean {
  return role.length > 0 && notes.some((note) => role.includes(note.soundingPitchClass));
}

function chordRoles(label: PaperSemiCrfSupportedLabel): ChordRoles {
  const match = /^([A-G](?:bb|##|b|#)?):(maj|min|dim|aug)(4|6|7)?$/.exec(label.normalizedLabel);
  if (!match) throw new Error("unsupported paper semi-CRF feature label");
  const mode = match[2]!;
  const extension = match[3] ?? "";
  const root = pitchClass(label.chord.root.step, label.chord.root.alter);
  const third = mod12(root + (mode === "min" || mode === "dim" ? 3 : 4));
  // The reference falls through to a major-triad fifth for aug labels.
  const fifth = mod12(root + (mode === "dim" ? 6 : 7));
  const added =
    extension === "4"
      ? [mod12(root + 5)]
      : extension === "6"
        ? mode === "min"
          ? [mod12(root + 9), mod12(root + 8)]
          : [mod12(root + 9)]
        : extension === "7"
          ? mode === "dim"
            ? [mod12(root + 10), mod12(root + 9)]
            : [mod12(root + 11), mod12(root + 10)]
          : [];
  return { root: [root], third: [third], fifth: [fifth], added };
}

function pitchClass(step: string, alter: number): number {
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return mod12(natural[step]! + alter);
}

function formatReferenceDouble(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
