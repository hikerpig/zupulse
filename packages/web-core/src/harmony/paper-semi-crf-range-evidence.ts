import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "./paper-semi-crf-events";

export type PaperSemiCrfRangeEvidence = {
  noteCount: number;
  noteCountByPitchClass: Float64Array;
  durationTotal: number;
  durationByPitchClass: Float64Array;
  accentTotal: number;
  accentByPitchClass: Float64Array;
  sourceDurationByPitchClass: Float64Array;
  firstEventBass?: PaperSemiCrfEventNote;
  segmentBass?: PaperSemiCrfEventNote;
  eventCount: number;
  eventDurationTotal: number;
  eventAccentTotal: number;
  durationBassByPitchClass: Float64Array;
  accentBassByPitchClass: Float64Array;
  bassEventCountByPitchClass: Float64Array;
  segmentDurationCoverage(role: readonly number[]): {
    matching: number;
    total: number;
    matchedCount: number;
    eventCount: number;
  };
};

export type PaperSemiCrfRangeEvidenceCache = {
  forRange(startEvent: number, endEvent: number): PaperSemiCrfRangeEvidence;
};

export function createPaperSemiCrfRangeEvidenceCache(
  allEvents: readonly PaperSemiCrfEvent[],
): PaperSemiCrfRangeEvidenceCache {
  const cache = new Map<number, PaperSemiCrfRangeEvidence>();
  let activeEndEvent = -1;
  return {
    forRange(startEvent, endEvent) {
      if (
        !Number.isSafeInteger(startEvent) ||
        !Number.isSafeInteger(endEvent) ||
        startEvent < 0 ||
        endEvent > allEvents.length ||
        startEvent >= endEvent
      ) {
        throw new Error("invalid paper Semi-CRF evidence range");
      }
      if (endEvent !== activeEndEvent) {
        cache.clear();
        activeEndEvent = endEvent;
      }
      const cached = cache.get(startEvent);
      if (cached) return cached;
      const evidence = buildRangeEvidence(allEvents, startEvent, endEvent);
      cache.set(startEvent, evidence);
      return evidence;
    },
  };
}

function buildRangeEvidence(
  allEvents: readonly PaperSemiCrfEvent[],
  startEvent: number,
  endEvent: number,
): PaperSemiCrfRangeEvidence {
  const events = allEvents.slice(startEvent, endEvent);
  const notes = events.flatMap((event, index) => event.notes.filter((note) => index === 0 || !note.heldFromPrevious));
  const firstEvent = events[0]!;
  const noteCountByPitchClass = zeros();
  const durationByPitchClass = zeros();
  const accentByPitchClass = zeros();
  const sourceDurationByPitchClass = zeros();
  let durationTotal = 0;
  let accentTotal = 0;
  for (const note of notes) {
    const pitchClass = note.soundingPitchClass;
    const duration = note.heldFromPrevious
      ? note.sourceDurationTicks - (firstEvent.startTick - note.onsetTick)
      : note.sourceDurationTicks;
    const accent = note.heldFromPrevious ? 0 : note.metricAccent;
    noteCountByPitchClass[pitchClass] = noteCountByPitchClass[pitchClass]! + 1;
    durationByPitchClass[pitchClass] = durationByPitchClass[pitchClass]! + duration;
    accentByPitchClass[pitchClass] = accentByPitchClass[pitchClass]! + accent;
    sourceDurationByPitchClass[pitchClass] = sourceDurationByPitchClass[pitchClass]! + note.sourceDurationTicks;
    durationTotal += duration;
    accentTotal += accent;
  }

  const durationBassByPitchClass = zeros();
  const accentBassByPitchClass = zeros();
  const bassEventCountByPitchClass = zeros();
  const eventPitchMasks: number[] = [];
  let eventDurationTotal = 0;
  let eventAccentTotal = 0;
  for (const [index, event] of events.entries()) {
    let pitchMask = 0;
    for (const note of event.notes) pitchMask |= 1 << note.soundingPitchClass;
    eventPitchMasks[index] = pitchMask;
    eventDurationTotal += event.durationTicks;
    eventAccentTotal += event.metricAccent;
    const bass = lowestNote(event.notes);
    if (bass) {
      durationBassByPitchClass[bass.soundingPitchClass] =
        durationBassByPitchClass[bass.soundingPitchClass]! + event.durationTicks;
      accentBassByPitchClass[bass.soundingPitchClass] =
        accentBassByPitchClass[bass.soundingPitchClass]! + event.metricAccent;
      bassEventCountByPitchClass[bass.soundingPitchClass] = bassEventCountByPitchClass[bass.soundingPitchClass]! + 1;
    }
  }
  const firstEventBass = lowestNote(firstEvent.notes);
  const segmentBass = lowestNote(notes);
  const durationCoverageByRoleMask = new Map<
    number,
    { matching: number; total: number; matchedCount: number; eventCount: number }
  >();

  return {
    noteCount: notes.length,
    noteCountByPitchClass,
    durationTotal,
    durationByPitchClass,
    accentTotal,
    accentByPitchClass,
    sourceDurationByPitchClass,
    ...(firstEventBass === undefined ? {} : { firstEventBass }),
    ...(segmentBass === undefined ? {} : { segmentBass }),
    eventCount: events.length,
    eventDurationTotal,
    eventAccentTotal,
    durationBassByPitchClass,
    accentBassByPitchClass,
    bassEventCountByPitchClass,
    segmentDurationCoverage(role) {
      let roleMask = 0;
      for (const pitchClass of role) roleMask |= 1 << pitchClass;
      const cached = durationCoverageByRoleMask.get(roleMask);
      if (cached) return cached;
      let matching = 0;
      let matchedCount = 0;
      for (const [index, event] of events.entries()) {
        if ((eventPitchMasks[index]! & roleMask) === 0) continue;
        matching += event.durationTicks;
        matchedCount += 1;
      }
      const coverage = { matching, total: eventDurationTotal, matchedCount, eventCount: events.length };
      durationCoverageByRoleMask.set(roleMask, coverage);
      return coverage;
    },
  };
}

function zeros(): Float64Array {
  return new Float64Array(12);
}

function lowestNote(notes: readonly PaperSemiCrfEventNote[]): PaperSemiCrfEventNote | undefined {
  let bass: PaperSemiCrfEventNote | undefined;
  for (const note of notes) {
    if (!bass) {
      bass = note;
      continue;
    }
    if (note.soundingMidi !== undefined && bass.soundingMidi !== undefined) {
      if (note.soundingMidi < bass.soundingMidi) bass = note;
    } else if (note.soundingMidi !== undefined) {
      bass = note;
    } else if (bass.soundingMidi === undefined && note.soundingPitchClass < bass.soundingPitchClass) {
      bass = note;
    }
  }
  return bass;
}
