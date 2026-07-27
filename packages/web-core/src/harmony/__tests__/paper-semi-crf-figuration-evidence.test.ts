import { describe, expect, it } from "vitest";
import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "../paper-semi-crf-events";
import {
  createPaperSemiCrfFigurationEvidenceCache,
  paperSemiCrfNotesWithoutFiguration,
} from "../paper-semi-crf-figuration-evidence";

describe("paper Semi-CRF figuration evidence", () => {
  it("removes passing and neighbor tones with the reference boundary semantics", () => {
    const events = [
      event(0, 0, 480, 1, [note("start", 0, 60, 0, 1)]),
      event(1, 480, 960, 0.5, [note("passing", 2, 62, 480, 0.5)]),
      event(2, 960, 1440, 0.25, [note("end", 4, 64, 960, 0.25)]),
    ];

    expect(paperSemiCrfNotesWithoutFiguration(events, 0, 3, new Set([0, 4, 7])).map((note) => note.id)).toEqual([
      "start",
      "end",
    ]);
  });

  it("caches singleton bass evidence by event and chord pitch-class mask", () => {
    const events = [
      event(0, 0, 480, 1, [note("c", 0, 60, 0, 1), note("e", 4, 64, 0, 1)]),
      event(1, 480, 960, 0.5, [note("d", 2, 62, 480, 0.5)]),
    ];
    const cache = createPaperSemiCrfFigurationEvidenceCache(events);
    const chordPitchClasses = new Set([0, 4, 7]);

    const first = cache.singleEventBass(1, chordPitchClasses);
    const second = cache.singleEventBass(1, new Set([7, 4, 0]));

    expect(first?.id).toBe("d");
    expect(second).toBe(first);
    expect(cache.computedSingletons()).toBe(1);
  });
});

function event(
  index: number,
  startTick: number,
  endTick: number,
  metricAccent: number,
  notes: PaperSemiCrfEventNote[],
): PaperSemiCrfEvent {
  return {
    index,
    range: {
      start: { measureIndex: 0, offsetTicks: startTick },
      end: { measureIndex: 0, offsetTicks: endTick },
    },
    startTick,
    endTick,
    durationTicks: endTick - startTick,
    metricAccent,
    notes,
  };
}

function note(
  id: string,
  soundingPitchClass: number,
  soundingMidi: number,
  onsetTick: number,
  metricAccent: number,
): PaperSemiCrfEventNote {
  return {
    id,
    trackId: "track",
    staffIndex: 0,
    voice: 1,
    onset: { measureIndex: 0, offsetTicks: onsetTick },
    onsetTick,
    soundingPitchClass,
    soundingMidi,
    durationTicks: 480,
    sourceDurationTicks: 480,
    heldFromPrevious: false,
    metricAccent,
    isBass: false,
  };
}
