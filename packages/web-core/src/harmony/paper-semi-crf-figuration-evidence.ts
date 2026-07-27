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
  const useCompactDurationPrefixes = canUseCompactDurationPrefixes(events);
  const retainedNotes = createRetainedNotesCache(events);
  const prefixComputedMasks = new Set<number>();
  const directlyComputedEventsByMask = new Map<number, Set<number>>();
  let computedSingletonCount = 0;
  const prefixByChordMask = new Map<number, FigurationPrefixEvidence>();
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
    const mask = pitchClassMask(chordPitchClasses);
    if (!prefixComputedMasks.has(mask)) {
      let directlyComputedEvents = directlyComputedEventsByMask.get(mask);
      if (!directlyComputedEvents) {
        directlyComputedEvents = new Set<number>();
        directlyComputedEventsByMask.set(mask, directlyComputedEvents);
      }
      if (!directlyComputedEvents.has(eventIndex)) {
        directlyComputedEvents.add(eventIndex);
        computedSingletonCount += 1;
      }
    }
    return lowestRetainedNote(events[eventIndex]!, retainedNotes.forEvent(eventIndex, true, true, chordPitchClasses));
  };
  const prefixFor = (chordPitchClasses: ReadonlySet<number>, mask: number) => {
    const cached = prefixByChordMask.get(mask);
    if (cached) return cached;
    const prefix = buildFigurationPrefixEvidence(events, retainedNotes, chordPitchClasses, useCompactDurationPrefixes);
    prefixByChordMask.set(mask, prefix);
    computedSingletonCount += events.length - (directlyComputedEventsByMask.get(mask)?.size ?? 0);
    directlyComputedEventsByMask.delete(mask);
    prefixComputedMasks.add(mask);
    return prefix;
  };
  return {
    forRange(startEvent, endEvent, chordPitchClasses) {
      const firstEvent = events[startEvent]!;
      const chordMask = pitchClassMask(chordPitchClasses);
      const prefix = prefixFor(chordPitchClasses, chordMask);
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
      rangeEvidence.eventDurationTotal = prefix.eventDuration[endEvent]! - prefix.eventDuration[startEvent]!;
      rangeEvidence.eventAccentTotal = prefix.eventAccent[endEvent]! - prefix.eventAccent[startEvent]!;
      addBassPrefixRange(prefix, startEvent, endEvent, rangeEvidence);
      if (endEvent - startEvent === 1) {
        addRetainedEventEvidence(
          events[startEvent]!,
          retainedNotes.forEvent(startEvent, true, true, chordPitchClasses),
          firstEvent.startTick,
          rangeEvidence,
        );
      } else {
        addRetainedEventEvidence(
          events[startEvent]!,
          retainedNotes.forEvent(startEvent, true, false, chordPitchClasses),
          firstEvent.startTick,
          rangeEvidence,
        );
        addPrefixRange(prefix, startEvent + 1, endEvent - 1, firstEvent.startTick, rangeEvidence);
        addRetainedEventEvidence(
          events[endEvent - 1]!,
          retainedNotes.forEvent(endEvent - 1, false, true, chordPitchClasses),
          firstEvent.startTick,
          rangeEvidence,
        );
      }
      return rangeEvidence;
    },
    singleEventBass,
    computedSingletons() {
      return computedSingletonCount;
    },
  };
}

type FigurationPrefixEvidence = {
  noteCount: Uint32Array;
  durationBase: Float64Array | Uint32Array;
  heldCount: Uint32Array;
  accent: Float32Array;
  noteCountByPitchClass: Uint32Array;
  durationBaseByPitchClass: Float64Array | Uint32Array;
  heldCountByPitchClass: Uint32Array;
  accentByPitchClass: Float32Array;
  eventDuration: Float64Array | Uint32Array;
  eventAccent: Float32Array;
  durationBassByPitchClass: Float64Array | Uint32Array;
  accentBassByPitchClass: Float32Array;
  bassEventCountByPitchClass: Uint32Array;
  interiorBass: Array<PaperSemiCrfEventNote | undefined>;
};

function buildFigurationPrefixEvidence(
  events: readonly PaperSemiCrfEvent[],
  retainedNotes: ReturnType<typeof createRetainedNotesCache>,
  chordPitchClasses: ReadonlySet<number>,
  useCompactDurations: boolean,
): FigurationPrefixEvidence {
  const length = events.length + 1;
  const durations = (size: number) => (useCompactDurations ? new Uint32Array(size) : new Float64Array(size));
  const prefix: FigurationPrefixEvidence = {
    noteCount: new Uint32Array(length),
    durationBase: durations(length),
    heldCount: new Uint32Array(length),
    accent: new Float32Array(length),
    noteCountByPitchClass: new Uint32Array(length * 12),
    durationBaseByPitchClass: durations(length * 12),
    heldCountByPitchClass: new Uint32Array(length * 12),
    accentByPitchClass: new Float32Array(length * 12),
    eventDuration: durations(length),
    eventAccent: new Float32Array(length),
    durationBassByPitchClass: durations(length * 12),
    accentBassByPitchClass: new Float32Array(length * 12),
    bassEventCountByPitchClass: new Uint32Array(length * 12),
    interiorBass: Array.from({ length: events.length }),
  };
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex]!;
    const current = eventIndex + 1;
    prefix.noteCount[current] = prefix.noteCount[eventIndex]!;
    prefix.durationBase[current] = prefix.durationBase[eventIndex]!;
    prefix.heldCount[current] = prefix.heldCount[eventIndex]!;
    prefix.accent[current] = prefix.accent[eventIndex]!;
    prefix.eventDuration[current] = prefix.eventDuration[eventIndex]! + event.durationTicks;
    prefix.eventAccent[current] = prefix.eventAccent[eventIndex]! + event.metricAccent;
    copyPitchClassPrefix(prefix, eventIndex, current);
    const interior = retainedNotes.forEvent(eventIndex, false, false, chordPitchClasses);
    forEachRetainedNote(event, interior, (note) => {
      const pitchClass = note.soundingPitchClass;
      const offset = current * 12 + pitchClass;
      prefix.noteCount[current] = prefix.noteCount[current]! + 1;
      prefix.noteCountByPitchClass[offset] = prefix.noteCountByPitchClass[offset]! + 1;
      const durationBase = note.sourceDurationTicks + (note.heldFromPrevious ? note.onsetTick : 0);
      prefix.durationBase[current] = prefix.durationBase[current]! + durationBase;
      prefix.durationBaseByPitchClass[offset] = prefix.durationBaseByPitchClass[offset]! + durationBase;
      if (note.heldFromPrevious) {
        prefix.heldCount[current] = prefix.heldCount[current]! + 1;
        prefix.heldCountByPitchClass[offset] = prefix.heldCountByPitchClass[offset]! + 1;
      } else {
        prefix.accent[current] = prefix.accent[current]! + note.metricAccent;
        prefix.accentByPitchClass[offset] = prefix.accentByPitchClass[offset]! + note.metricAccent;
      }
    });
    prefix.interiorBass[eventIndex] = lowestRetainedNote(event, interior);
    const singletonBass = lowestRetainedNote(event, retainedNotes.forEvent(eventIndex, true, true, chordPitchClasses));
    if (singletonBass) {
      const offset = current * 12 + singletonBass.soundingPitchClass;
      prefix.durationBassByPitchClass[offset] = prefix.durationBassByPitchClass[offset]! + event.durationTicks;
      prefix.accentBassByPitchClass[offset] = prefix.accentBassByPitchClass[offset]! + event.metricAccent;
      prefix.bassEventCountByPitchClass[offset] = prefix.bassEventCountByPitchClass[offset]! + 1;
    }
  }
  return prefix;
}

function canUseCompactDurationPrefixes(events: readonly PaperSemiCrfEvent[]): boolean {
  const maximum = 0xffffffff;
  let eventDurationTotal = 0;
  let noteDurationUpperBound = 0;
  for (const event of events) {
    eventDurationTotal += event.durationTicks;
    if (eventDurationTotal > maximum) return false;
    for (const note of event.notes) {
      noteDurationUpperBound += note.sourceDurationTicks + note.onsetTick;
      if (noteDurationUpperBound > maximum) return false;
    }
  }
  return true;
}

function copyPitchClassPrefix(prefix: FigurationPrefixEvidence, previous: number, current: number): void {
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const previousOffset = previous * 12 + pitchClass;
    const currentOffset = current * 12 + pitchClass;
    prefix.noteCountByPitchClass[currentOffset] = prefix.noteCountByPitchClass[previousOffset]!;
    prefix.durationBaseByPitchClass[currentOffset] = prefix.durationBaseByPitchClass[previousOffset]!;
    prefix.heldCountByPitchClass[currentOffset] = prefix.heldCountByPitchClass[previousOffset]!;
    prefix.accentByPitchClass[currentOffset] = prefix.accentByPitchClass[previousOffset]!;
    prefix.durationBassByPitchClass[currentOffset] = prefix.durationBassByPitchClass[previousOffset]!;
    prefix.accentBassByPitchClass[currentOffset] = prefix.accentBassByPitchClass[previousOffset]!;
    prefix.bassEventCountByPitchClass[currentOffset] = prefix.bassEventCountByPitchClass[previousOffset]!;
  }
}

function addPrefixRange(
  prefix: FigurationPrefixEvidence,
  startEvent: number,
  endEvent: number,
  firstStartTick: number,
  evidence: PaperSemiCrfFigurationRangeEvidence,
): void {
  if (startEvent >= endEvent) return;
  const noteCount = prefix.noteCount[endEvent]! - prefix.noteCount[startEvent]!;
  const heldCount = prefix.heldCount[endEvent]! - prefix.heldCount[startEvent]!;
  evidence.noteCount += noteCount;
  evidence.durationTotal +=
    prefix.durationBase[endEvent]! - prefix.durationBase[startEvent]! - heldCount * firstStartTick;
  evidence.accentTotal += prefix.accent[endEvent]! - prefix.accent[startEvent]!;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const startOffset = startEvent * 12 + pitchClass;
    const endOffset = endEvent * 12 + pitchClass;
    const pitchHeldCount = prefix.heldCountByPitchClass[endOffset]! - prefix.heldCountByPitchClass[startOffset]!;
    evidence.noteCountByPitchClass[pitchClass] =
      evidence.noteCountByPitchClass[pitchClass]! +
      prefix.noteCountByPitchClass[endOffset]! -
      prefix.noteCountByPitchClass[startOffset]!;
    evidence.durationByPitchClass[pitchClass] =
      evidence.durationByPitchClass[pitchClass]! +
      prefix.durationBaseByPitchClass[endOffset]! -
      prefix.durationBaseByPitchClass[startOffset]! -
      pitchHeldCount * firstStartTick;
    evidence.accentByPitchClass[pitchClass] =
      evidence.accentByPitchClass[pitchClass]! +
      prefix.accentByPitchClass[endOffset]! -
      prefix.accentByPitchClass[startOffset]!;
  }
  for (let eventIndex = startEvent; eventIndex < endEvent; eventIndex += 1) {
    const bass = prefix.interiorBass[eventIndex];
    if (bass && (!evidence.segmentBass || lowerThan(bass, evidence.segmentBass))) evidence.segmentBass = bass;
  }
}

function addBassPrefixRange(
  prefix: FigurationPrefixEvidence,
  startEvent: number,
  endEvent: number,
  evidence: PaperSemiCrfFigurationRangeEvidence,
): void {
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const startOffset = startEvent * 12 + pitchClass;
    const endOffset = endEvent * 12 + pitchClass;
    evidence.durationBassByPitchClass[pitchClass] =
      prefix.durationBassByPitchClass[endOffset]! - prefix.durationBassByPitchClass[startOffset]!;
    evidence.accentBassByPitchClass[pitchClass] =
      prefix.accentBassByPitchClass[endOffset]! - prefix.accentBassByPitchClass[startOffset]!;
    evidence.bassEventCountByPitchClass[pitchClass] =
      prefix.bassEventCountByPitchClass[endOffset]! - prefix.bassEventCountByPitchClass[startOffset]!;
  }
}

function addRetainedEventEvidence(
  event: PaperSemiCrfEvent,
  retained: RetainedEventNotes,
  firstStartTick: number,
  evidence: PaperSemiCrfFigurationRangeEvidence,
): void {
  forEachRetainedNote(event, retained, (note) => {
    const pitchClass = note.soundingPitchClass;
    const duration = note.heldFromPrevious
      ? note.sourceDurationTicks - (firstStartTick - note.onsetTick)
      : note.sourceDurationTicks;
    const accent = note.heldFromPrevious ? 0 : note.metricAccent;
    evidence.noteCount += 1;
    evidence.noteCountByPitchClass[pitchClass] = evidence.noteCountByPitchClass[pitchClass]! + 1;
    evidence.durationByPitchClass[pitchClass] = evidence.durationByPitchClass[pitchClass]! + duration;
    evidence.accentByPitchClass[pitchClass] = evidence.accentByPitchClass[pitchClass]! + accent;
    evidence.durationTotal += duration;
    evidence.accentTotal += accent;
    if (!evidence.segmentBass || lowerThan(note, evidence.segmentBass)) evidence.segmentBass = note;
  });
}

function createRetainedNotesCache(events: readonly PaperSemiCrfEvent[]): {
  forEvent(
    eventIndex: number,
    isRangeStart: boolean,
    isRangeEnd: boolean,
    chordPitchClasses: ReadonlySet<number>,
  ): RetainedEventNotes;
} {
  const compactRetainedByChordMask = new Map<number, Int32Array>();
  const overflowRetainedByContext = new Map<number, readonly PaperSemiCrfEventNote[]>();
  return {
    forEvent(eventIndex, isRangeStart, isRangeEnd, chordPitchClasses) {
      const mask = pitchClassMask(chordPitchClasses);
      const context = (Number(isRangeStart) << 1) | Number(isRangeEnd);
      const compactIndex = eventIndex * 4 + context;
      if (events[eventIndex]!.notes.length <= 31) {
        let retainedByContext = compactRetainedByChordMask.get(mask);
        if (!retainedByContext) {
          retainedByContext = new Int32Array(events.length * 4);
          retainedByContext.fill(-1);
          compactRetainedByChordMask.set(mask, retainedByContext);
        }
        const cached = retainedByContext[compactIndex]!;
        if (cached !== -1) return cached;
        const retainedNotes = computeRetainedEventNotes(
          events,
          eventIndex,
          isRangeStart,
          isRangeEnd,
          chordPitchClasses,
        );
        const retained = retainedNotes.reduce(
          (noteMask, note) => noteMask | (1 << events[eventIndex]!.notes.indexOf(note)),
          0,
        );
        retainedByContext[compactIndex] = retained;
        return retained;
      }
      const key = (eventIndex * 4096 + mask) * 4 + context;
      const cached = overflowRetainedByContext.get(key);
      if (cached) return cached;
      const retainedNotes = computeRetainedEventNotes(events, eventIndex, isRangeStart, isRangeEnd, chordPitchClasses);
      overflowRetainedByContext.set(key, retainedNotes);
      return retainedNotes;
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
