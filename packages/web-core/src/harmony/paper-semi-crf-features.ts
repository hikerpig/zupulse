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
  const nonFigurationNotes = notesWithoutFiguration(input.events, input.segment, chordPitchClasses);
  const features = [
    `PURITY_${purityBin(notes, events, chordPitchClasses, "count")}`,
    `ACCENTED_PURITY_${purityBin(notes, events, chordPitchClasses, "accent")}`,
    `DURATION_PURITY_${purityBin(notes, events, chordPitchClasses, "duration")}`,
    `FIG_PURITY_${purityBin(nonFigurationNotes, events, chordPitchClasses, "count")}`,
    `FIG_ACCENTED_PURITY_${purityBin(nonFigurationNotes, events, chordPitchClasses, "accent")}`,
    `FIG_DURATION_PURITY_${purityBin(nonFigurationNotes, events, chordPitchClasses, "duration")}`,
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
  if (roles.added.length > 0 && addedDurationExceedsRoot(notes, roles)) {
    features.push("DURATION_ADDED_NOTE_GREATER_THAN_ROOT");
  }
  const roleEntries = [
    { name: "ROOT", pitchClasses: roles.root },
    { name: "THIRD", pitchClasses: roles.third },
    { name: "FIFTH", pitchClasses: roles.fifth },
    { name: "ADDED_NOTE", pitchClasses: roles.added },
  ] as const;
  for (const role of roleEntries) {
    features.push(
      `DURATION_${role.name}_COVERED_${weightedCoverageBin(notes, events, role.pitchClasses, "duration")}`,
      `FIG_DURATION_${role.name}_COVERED_${weightedCoverageBin(nonFigurationNotes, events, role.pitchClasses, "duration")}`,
      `SEGMENT_DURATION_${role.name}_COVERED_${segmentDurationCoverageBin(events, role.pitchClasses)}`,
    );
  }
  for (const role of roleEntries) {
    features.push(
      `ACCENT_${role.name}_COVERED_${weightedCoverageBin(notes, events, role.pitchClasses, "accent")}`,
      `FIG_ACCENT_${role.name}_COVERED_${weightedCoverageBin(nonFigurationNotes, events, role.pitchClasses, "accent")}`,
    );
  }
  features.push(`BEGINNING_ACCENTED_${formatReferenceDouble(events[0]!.metricAccent)}`);
  const firstBass = lowestNote(events[0]!.notes);
  const segmentBass = lowestNote(notes);
  const firstNonFigurationNotes = notesWithoutFiguration(
    input.events,
    { ...input.segment, endEvent: input.segment.startEvent + 1 },
    chordPitchClasses,
  );
  const firstNonFigurationBass = lowestNote(firstNonFigurationNotes);
  const segmentNonFigurationBass = lowestNote(nonFigurationNotes);
  const nonFigurationBassNotes = events.map((_, index) =>
    lowestNote(
      notesWithoutFiguration(
        input.events,
        {
          ...input.segment,
          startEvent: input.segment.startEvent + index,
          endEvent: input.segment.startEvent + index + 1,
        },
        chordPitchClasses,
      ),
    ),
  );
  for (const role of roleEntries) {
    if (firstBass && role.pitchClasses.includes(firstBass.soundingPitchClass)) {
      features.push(`FIRST_BASS_IS_${role.name}`);
    }
  }
  for (const role of roleEntries) {
    if (firstNonFigurationBass && role.pitchClasses.includes(firstNonFigurationBass.soundingPitchClass)) {
      features.push(`FIG_FIRST_BASS_IS_${role.name}`);
    }
  }
  for (const role of roleEntries) {
    if (segmentBass && role.pitchClasses.includes(segmentBass.soundingPitchClass)) {
      features.push(`SEGMENT_BASS_IS_${role.name}`);
    }
  }
  for (const role of roleEntries) {
    if (segmentNonFigurationBass && role.pitchClasses.includes(segmentNonFigurationBass.soundingPitchClass)) {
      features.push(`FIG_SEGMENT_BASS_IS_${role.name}`);
    }
  }
  for (const role of roleEntries) {
    features.push(`DURATION_BASS_IS_${role.name}_${weightedBassBin(events, role.pitchClasses, "duration")}`);
  }
  for (const role of roleEntries) {
    features.push(`ACCENT_BASS_IS_${role.name}_${weightedBassBin(events, role.pitchClasses, "accent")}`);
  }
  for (const role of roleEntries) {
    features.push(
      `FIG_DURATION_BASS_IS_${role.name}_${weightedBassBin(events, role.pitchClasses, "duration", nonFigurationBassNotes)}`,
    );
  }
  for (const role of roleEntries) {
    features.push(
      `FIG_ACCENT_BASS_IS_${role.name}_${weightedBassBin(events, role.pitchClasses, "accent", nonFigurationBassNotes)}`,
    );
  }
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

function weightedCoverageBin(
  notes: readonly PaperSemiCrfEventNote[],
  events: readonly PaperSemiCrfEvent[],
  role: readonly number[],
  weight: Exclude<FeatureWeight, "count">,
): number {
  if (role.length === 0) return 0;
  let total = 0;
  let matching = 0;
  let matchedCount = 0;
  for (const note of notes) {
    const value = noteWeight(note, events[0]!, weight);
    total += value;
    if (role.includes(note.soundingPitchClass)) {
      matching += value;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({ matching, total, matchedCount, noteCount: notes.length });
}

function segmentDurationCoverageBin(events: readonly PaperSemiCrfEvent[], role: readonly number[]): number {
  if (role.length === 0) return 0;
  const coveredEvents = events.filter((event) => event.notes.some((note) => role.includes(note.soundingPitchClass)));
  return paperSemiCrfConsistencyBin({
    matching: coveredEvents.reduce((sum, event) => sum + event.durationTicks, 0),
    total: events.reduce((sum, event) => sum + event.durationTicks, 0),
    matchedCount: coveredEvents.length,
    noteCount: events.length,
  });
}

function addedDurationExceedsRoot(notes: readonly PaperSemiCrfEventNote[], roles: ChordRoles): boolean {
  const durationFor = (role: readonly number[]): number =>
    notes
      .filter((note) => role.includes(note.soundingPitchClass))
      .reduce((sum, note) => sum + note.sourceDurationTicks, 0);
  return durationFor(roles.added) > durationFor(roles.root);
}

function weightedBassBin(
  events: readonly PaperSemiCrfEvent[],
  role: readonly number[],
  weight: Exclude<FeatureWeight, "count">,
  bassNotes?: readonly (PaperSemiCrfEventNote | undefined)[],
): number {
  if (role.length === 0) return 0;
  let matching = 0;
  let total = 0;
  let matchedCount = 0;
  for (const [index, event] of events.entries()) {
    const eventWeight = weight === "duration" ? event.durationTicks : event.metricAccent;
    const bass = bassNotes ? bassNotes[index] : lowestNote(event.notes);
    total += eventWeight;
    if (bass && role.includes(bass.soundingPitchClass)) {
      matching += eventWeight;
      matchedCount += 1;
    }
  }
  return paperSemiCrfConsistencyBin({
    matching,
    total,
    matchedCount,
    noteCount: events.length,
  });
}

function notesWithoutFiguration(
  allEvents: readonly PaperSemiCrfEvent[],
  segment: PaperSemiCrfSegment,
  chordPitchClasses: ReadonlySet<number>,
): PaperSemiCrfEventNote[] {
  const events = allEvents.slice(segment.startEvent, segment.endEvent);
  const result = [...notesInSegment(events)];
  const previousEvent = allEvents[segment.startEvent - 1];
  const nextEvent = allEvents[segment.endEvent];
  const firstEvent = events[0]!;
  const lastEvent = events.at(-1)!;

  if (previousEvent) {
    for (const firstNote of firstEvent.notes) {
      for (const previousNote of previousEvent.notes) {
        if (
          samePitch(firstNote, previousNote) &&
          firstNote.onsetTick === previousNote.onsetTick + previousNote.sourceDurationTicks &&
          !chordPitchClasses.has(firstNote.soundingPitchClass) &&
          firstNote.sourceDurationTicks <= previousNote.sourceDurationTicks &&
          isHarmonic(previousNote, previousEvent.notes)
        ) {
          removeMatchingNote(result, firstNote);
        }
      }
    }
  }

  if (nextEvent) {
    for (const lastNote of lastEvent.notes) {
      for (const nextNote of nextEvent.notes) {
        if (
          samePitch(lastNote, nextNote) &&
          lastNote.onsetTick + lastNote.sourceDurationTicks === nextNote.onsetTick &&
          !chordPitchClasses.has(lastNote.soundingPitchClass) &&
          lastNote.sourceDurationTicks <= nextNote.sourceDurationTicks &&
          isHarmonic(nextNote, nextEvent.notes)
        ) {
          removeMatchingNote(result, lastNote);
        }
      }
    }
  }

  const emptyEvent = (): PaperSemiCrfEvent => ({
    index: -1,
    range: {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 1 },
    },
    startTick: 0,
    endTick: 1,
    durationTicks: 1,
    metricAccent: 0,
    notes: [],
  });
  const before = previousEvent ?? emptyEvent();
  const after = nextEvent ?? emptyEvent();
  const contextualEvents = [before, ...events, after];
  for (let index = 0; index < contextualEvents.length - 2; index += 1) {
    const currentEvent = contextualEvents[index]!;
    const middleEvent = contextualEvents[index + 1]!;
    const finalEvent = contextualEvents[index + 2]!;
    for (const currentNote of currentEvent.notes) {
      let harmonicCount =
        currentEvent !== before && chordPitchClasses.has(currentNote.soundingPitchClass)
          ? 1
          : Number(isHarmonic(currentNote, currentEvent.notes));
      let belongsToSegment = currentEvent !== before && chordPitchClasses.has(currentNote.soundingPitchClass) ? 1 : 0;
      for (const middleNote of middleEvent.notes) {
        const firstDirection = stepDirection(currentNote, middleNote);
        if (
          currentNote.metricAccent <= middleNote.metricAccent ||
          chordPitchClasses.has(middleNote.soundingPitchClass) ||
          currentNote.onsetTick + currentNote.sourceDurationTicks !== middleNote.onsetTick ||
          middleNote.sourceDurationTicks > currentNote.sourceDurationTicks ||
          firstDirection === 0
        ) {
          continue;
        }
        for (const finalNote of finalEvent.notes) {
          const secondDirection = stepDirection(middleNote, finalNote);
          if (
            middleNote.onsetTick + middleNote.sourceDurationTicks !== finalNote.onsetTick ||
            middleNote.sourceDurationTicks > finalNote.sourceDurationTicks ||
            secondDirection === 0
          ) {
            continue;
          }
          if (finalEvent !== after && chordPitchClasses.has(finalNote.soundingPitchClass)) {
            belongsToSegment += 1;
            harmonicCount += 1;
          } else if (isHarmonic(finalNote, finalEvent.notes)) {
            harmonicCount += 1;
          }
          const neighbor = samePitch(currentNote, finalNote);
          const passing = firstDirection === secondDirection;
          if (harmonicCount > 1 && belongsToSegment >= 1 && (neighbor || passing)) {
            removeMatchingNote(result, middleNote);
          }
        }
      }
    }
  }
  return result;
}

function isHarmonic(note: PaperSemiCrfEventNote, eventNotes: readonly PaperSemiCrfEventNote[]): boolean {
  let harmonicCount = 0;
  const seen = new Set<string>();
  const otherNoteCount = eventNotes.length - 1;
  for (const other of eventNotes) {
    if (other === note || samePitch(other, note)) continue;
    const key = `${other.soundingPitchClass}`;
    if (seen.has(key)) continue;
    const interval = mod12(other.soundingPitchClass - note.soundingPitchClass);
    const reverse = mod12(note.soundingPitchClass - other.soundingPitchClass);
    if ([3, 4, 7].includes(interval) || [3, 4, 7].includes(reverse)) {
      seen.add(key);
      harmonicCount += 1;
    }
    if (otherNoteCount > 2 && harmonicCount === 2) return true;
    if (harmonicCount === otherNoteCount) return true;
  }
  return false;
}

function stepDirection(from: PaperSemiCrfEventNote, to: PaperSemiCrfEventNote): -1 | 0 | 1 {
  const fromMidi = from.soundingMidi;
  const toMidi = to.soundingMidi;
  if (fromMidi === undefined || toMidi === undefined) return 0;
  const difference = toMidi - fromMidi;
  if (difference >= 1 && difference <= 3) return 1;
  if (difference <= -1 && difference >= -3) return -1;
  return 0;
}

function samePitch(left: PaperSemiCrfEventNote, right: PaperSemiCrfEventNote): boolean {
  if (left.soundingMidi !== undefined && right.soundingMidi !== undefined) {
    if (left.soundingMidi !== right.soundingMidi) return false;
    if (left.spelling && right.spelling) {
      return left.spelling.step === right.spelling.step && left.spelling.alter === right.spelling.alter;
    }
    return true;
  }
  return left.soundingPitchClass === right.soundingPitchClass;
}

function removeMatchingNote(notes: PaperSemiCrfEventNote[], target: PaperSemiCrfEventNote): void {
  const index = notes.findIndex(
    (note) =>
      note === target ||
      (note.id === target.id &&
        note.onsetTick === target.onsetTick &&
        note.sourceDurationTicks === target.sourceDurationTicks),
  );
  if (index >= 0) notes.splice(index, 1);
}

function lowestNote(notes: readonly PaperSemiCrfEventNote[]): PaperSemiCrfEventNote | undefined {
  return notes.reduce<PaperSemiCrfEventNote | undefined>((bass, note) => {
    if (!bass) return note;
    if (note.soundingMidi !== undefined && bass.soundingMidi !== undefined) {
      return note.soundingMidi < bass.soundingMidi ? note : bass;
    }
    if (note.soundingMidi !== undefined) return note;
    if (bass.soundingMidi !== undefined) return bass;
    return note.soundingPitchClass < bass.soundingPitchClass ? note : bass;
  }, undefined);
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
