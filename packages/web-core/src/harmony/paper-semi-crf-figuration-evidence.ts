import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "./paper-semi-crf-events";

export type PaperSemiCrfFigurationEvidenceCache = {
  forRange(
    startEvent: number,
    endEvent: number,
    chordPitchClasses: ReadonlySet<number>,
  ): PaperSemiCrfFigurationRangeEvidence;
  singleEventBass(eventIndex: number, chordPitchClasses: ReadonlySet<number>): PaperSemiCrfEventNote | undefined;
  computedSingletons(): number;
};

export type PaperSemiCrfFigurationRangeEvidence = {
  noteCount: number;
  noteCountByPitchClass: Float64Array;
  durationTotal: number;
  durationByPitchClass: Float64Array;
  accentTotal: number;
  accentByPitchClass: Float64Array;
  segmentBass?: PaperSemiCrfEventNote;
  eventCount: number;
  eventDurationTotal: number;
  eventAccentTotal: number;
  durationBassByPitchClass: Float64Array;
  accentBassByPitchClass: Float64Array;
  bassEventCountByPitchClass: Float64Array;
};

const EMPTY_EVENT: PaperSemiCrfEvent = {
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
};

export function createPaperSemiCrfFigurationEvidenceCache(
  events: readonly PaperSemiCrfEvent[],
): PaperSemiCrfFigurationEvidenceCache {
  const retainedNotes = createRetainedNotesCache(events);
  const computedSingletonKeys = new Set<number>();
  const rangeEvidence: PaperSemiCrfFigurationRangeEvidence = {
    noteCount: 0,
    noteCountByPitchClass: new Float64Array(12),
    durationTotal: 0,
    durationByPitchClass: new Float64Array(12),
    accentTotal: 0,
    accentByPitchClass: new Float64Array(12),
    eventCount: 0,
    eventDurationTotal: 0,
    eventAccentTotal: 0,
    durationBassByPitchClass: new Float64Array(12),
    accentBassByPitchClass: new Float64Array(12),
    bassEventCountByPitchClass: new Float64Array(12),
  };
  const singleEventBass = (
    eventIndex: number,
    chordPitchClasses: ReadonlySet<number>,
  ): PaperSemiCrfEventNote | undefined => {
    if (!Number.isSafeInteger(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
      throw new Error("invalid paper Semi-CRF figuration event");
    }
    const key = eventIndex * 4096 + pitchClassMask(chordPitchClasses);
    computedSingletonKeys.add(key);
    return lowestRetainedNote(events[eventIndex]!, retainedNotes.forEvent(eventIndex, true, true, chordPitchClasses));
  };
  return {
    forRange(startEvent, endEvent, chordPitchClasses) {
      const firstEvent = events[startEvent]!;
      rangeEvidence.noteCount = 0;
      rangeEvidence.noteCountByPitchClass.fill(0);
      rangeEvidence.durationTotal = 0;
      rangeEvidence.durationByPitchClass.fill(0);
      rangeEvidence.accentTotal = 0;
      rangeEvidence.accentByPitchClass.fill(0);
      rangeEvidence.durationBassByPitchClass.fill(0);
      rangeEvidence.accentBassByPitchClass.fill(0);
      rangeEvidence.bassEventCountByPitchClass.fill(0);
      delete rangeEvidence.segmentBass;
      rangeEvidence.eventCount = endEvent - startEvent;
      rangeEvidence.eventDurationTotal = 0;
      rangeEvidence.eventAccentTotal = 0;
      for (let eventIndex = startEvent; eventIndex < endEvent; eventIndex += 1) {
        const event = events[eventIndex]!;
        const retained = retainedNotes.forEvent(
          eventIndex,
          eventIndex === startEvent,
          eventIndex === endEvent - 1,
          chordPitchClasses,
        );
        forEachRetainedNote(event, retained, (note) => {
          const pitchClass = note.soundingPitchClass;
          const duration = note.heldFromPrevious
            ? note.sourceDurationTicks - (firstEvent.startTick - note.onsetTick)
            : note.sourceDurationTicks;
          const accent = note.heldFromPrevious ? 0 : note.metricAccent;
          rangeEvidence.noteCount += 1;
          rangeEvidence.noteCountByPitchClass[pitchClass] = rangeEvidence.noteCountByPitchClass[pitchClass]! + 1;
          rangeEvidence.durationByPitchClass[pitchClass] = rangeEvidence.durationByPitchClass[pitchClass]! + duration;
          rangeEvidence.accentByPitchClass[pitchClass] = rangeEvidence.accentByPitchClass[pitchClass]! + accent;
          rangeEvidence.durationTotal += duration;
          rangeEvidence.accentTotal += accent;
          const bass = rangeEvidence.segmentBass;
          if (!bass || lowerThan(note, bass)) rangeEvidence.segmentBass = note;
        });
        rangeEvidence.eventDurationTotal += event.durationTicks;
        rangeEvidence.eventAccentTotal += event.metricAccent;
        const bass = singleEventBass(eventIndex, chordPitchClasses);
        if (!bass) continue;
        rangeEvidence.durationBassByPitchClass[bass.soundingPitchClass] =
          rangeEvidence.durationBassByPitchClass[bass.soundingPitchClass]! + event.durationTicks;
        rangeEvidence.accentBassByPitchClass[bass.soundingPitchClass] =
          rangeEvidence.accentBassByPitchClass[bass.soundingPitchClass]! + event.metricAccent;
        rangeEvidence.bassEventCountByPitchClass[bass.soundingPitchClass] =
          rangeEvidence.bassEventCountByPitchClass[bass.soundingPitchClass]! + 1;
      }
      return rangeEvidence;
    },
    singleEventBass,
    computedSingletons() {
      return computedSingletonKeys.size;
    },
  };
}

function createRetainedNotesCache(events: readonly PaperSemiCrfEvent[]): {
  forEvent(
    eventIndex: number,
    isRangeStart: boolean,
    isRangeEnd: boolean,
    chordPitchClasses: ReadonlySet<number>,
  ): RetainedEventNotes;
} {
  const retainedByContext = new Map<number, RetainedEventNotes>();
  return {
    forEvent(eventIndex, isRangeStart, isRangeEnd, chordPitchClasses) {
      const mask = pitchClassMask(chordPitchClasses);
      const context = (Number(isRangeStart) << 1) | Number(isRangeEnd);
      const key = (eventIndex * 4096 + mask) * 4 + context;
      const cached = retainedByContext.get(key);
      if (cached !== undefined) return cached;
      const retainedNotes = computeRetainedEventNotes(events, eventIndex, isRangeStart, isRangeEnd, chordPitchClasses);
      const retained =
        eventIndex < events.length && events[eventIndex]!.notes.length <= 31
          ? retainedNotes.reduce((mask, note) => mask | (1 << events[eventIndex]!.notes.indexOf(note)), 0)
          : retainedNotes;
      retainedByContext.set(key, retained);
      return retained;
    },
  };
}

type RetainedEventNotes = number | readonly PaperSemiCrfEventNote[];

function forEachRetainedNote(
  event: PaperSemiCrfEvent,
  retained: RetainedEventNotes,
  visit: (note: PaperSemiCrfEventNote) => void,
): void {
  if (typeof retained !== "number") {
    for (const note of retained) visit(note);
    return;
  }
  for (const [index, note] of event.notes.entries()) {
    if ((retained & (1 << index)) !== 0) visit(note);
  }
}

function lowestRetainedNote(event: PaperSemiCrfEvent, retained: RetainedEventNotes): PaperSemiCrfEventNote | undefined {
  let bass: PaperSemiCrfEventNote | undefined;
  forEachRetainedNote(event, retained, (note) => {
    if (!bass || lowerThan(note, bass)) bass = note;
  });
  return bass;
}

function computeRetainedEventNotes(
  allEvents: readonly PaperSemiCrfEvent[],
  eventIndex: number,
  isRangeStart: boolean,
  isRangeEnd: boolean,
  chordPitchClasses: ReadonlySet<number>,
): readonly PaperSemiCrfEventNote[] {
  const event = allEvents[eventIndex];
  if (!event) throw new Error("invalid paper Semi-CRF figuration event");
  const previousEvent = allEvents[eventIndex - 1];
  const nextEvent = allEvents[eventIndex + 1];
  const result = event.notes.filter((note) => isRangeStart || !note.heldFromPrevious);

  if (isRangeStart && previousEvent) {
    for (const firstNote of event.notes) {
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

  if (isRangeEnd && nextEvent) {
    for (const lastNote of event.notes) {
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

  const currentEvent = previousEvent ?? EMPTY_EVENT;
  const finalEvent = nextEvent ?? EMPTY_EVENT;
  for (const currentNote of currentEvent.notes) {
    let harmonicCount =
      !isRangeStart && chordPitchClasses.has(currentNote.soundingPitchClass)
        ? 1
        : Number(isHarmonic(currentNote, currentEvent.notes));
    let belongsToSegment = !isRangeStart && chordPitchClasses.has(currentNote.soundingPitchClass) ? 1 : 0;
    for (const middleNote of event.notes) {
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
        if (!isRangeEnd && chordPitchClasses.has(finalNote.soundingPitchClass)) {
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
  return result;
}

export function paperSemiCrfNotesWithoutFiguration(
  allEvents: readonly PaperSemiCrfEvent[],
  startEvent: number,
  endEvent: number,
  chordPitchClasses: ReadonlySet<number>,
): PaperSemiCrfEventNote[] {
  if (
    !Number.isSafeInteger(startEvent) ||
    !Number.isSafeInteger(endEvent) ||
    startEvent < 0 ||
    endEvent > allEvents.length ||
    startEvent >= endEvent
  ) {
    throw new Error("invalid paper Semi-CRF figuration range");
  }
  const events = allEvents.slice(startEvent, endEvent);
  const result = [...notesInSegment(events)];
  const previousEvent = allEvents[startEvent - 1];
  const nextEvent = allEvents[endEvent];
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

  const before = previousEvent ?? EMPTY_EVENT;
  const after = nextEvent ?? EMPTY_EVENT;
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

export function paperSemiCrfLowestNote(notes: readonly PaperSemiCrfEventNote[]): PaperSemiCrfEventNote | undefined {
  return notes.reduce<PaperSemiCrfEventNote | undefined>((bass, note) => {
    return !bass || lowerThan(note, bass) ? note : bass;
  }, undefined);
}

function lowerThan(note: PaperSemiCrfEventNote, bass: PaperSemiCrfEventNote): boolean {
  if (note.soundingMidi !== undefined && bass.soundingMidi !== undefined) {
    return note.soundingMidi < bass.soundingMidi;
  }
  if (note.soundingMidi !== undefined) return true;
  if (bass.soundingMidi !== undefined) return false;
  return note.soundingPitchClass < bass.soundingPitchClass;
}

function notesInSegment(events: readonly PaperSemiCrfEvent[]): PaperSemiCrfEventNote[] {
  return events.flatMap((event, index) => event.notes.filter((note) => index === 0 || !note.heldFromPrevious));
}

function isHarmonic(note: PaperSemiCrfEventNote, eventNotes: readonly PaperSemiCrfEventNote[]): boolean {
  let harmonicCount = 0;
  let seenPitchClasses = 0;
  const otherNoteCount = eventNotes.length - 1;
  for (const other of eventNotes) {
    if (other === note || samePitch(other, note)) continue;
    const pitchClassBit = 1 << other.soundingPitchClass;
    if ((seenPitchClasses & pitchClassBit) !== 0) continue;
    const interval = mod12(other.soundingPitchClass - note.soundingPitchClass);
    const reverse = mod12(note.soundingPitchClass - other.soundingPitchClass);
    if (interval === 3 || interval === 4 || interval === 7 || reverse === 3 || reverse === 4 || reverse === 7) {
      seenPitchClasses |= pitchClassBit;
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

function pitchClassMask(pitchClasses: ReadonlySet<number>): number {
  let mask = 0;
  for (const pitchClass of pitchClasses) {
    if (!Number.isSafeInteger(pitchClass) || pitchClass < 0 || pitchClass > 11) {
      throw new Error("invalid paper Semi-CRF chord pitch class");
    }
    mask |= 1 << pitchClass;
  }
  return mask;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
