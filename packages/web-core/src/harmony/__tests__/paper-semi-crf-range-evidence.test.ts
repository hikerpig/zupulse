import { describe, expect, it } from "vitest";
import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "../paper-semi-crf-events";
import { createPaperSemiCrfRangeEvidenceCache } from "../paper-semi-crf-range-evidence";

describe("paper Semi-CRF range evidence", () => {
  it("counts held notes once and uses their duration remaining at the range start", () => {
    const events = [
      event(0, 0, 480, 1, [note("c", 0, 60, 960, false, 0, 1), note("e", 4, 64, 480, false, 0, 1)]),
      event(1, 480, 960, 0.5, [note("c", 0, 60, 960, true, 0, 0.5), note("g", 7, 67, 480, false, 480, 0.5)]),
    ];
    const cache = createPaperSemiCrfRangeEvidenceCache(events);

    const whole = cache.forRange(0, 2);
    expect(whole.noteCount).toBe(3);
    expect([...whole.noteCountByPitchClass]).toEqual([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
    expect([...whole.durationByPitchClass]).toEqual([960, 0, 0, 0, 480, 0, 0, 480, 0, 0, 0, 0]);
    expect([...whole.accentByPitchClass]).toEqual([1, 0, 0, 0, 1, 0, 0, 0.5, 0, 0, 0, 0]);

    const second = cache.forRange(1, 2);
    expect(second.noteCount).toBe(2);
    expect(second.durationByPitchClass[0]).toBe(480);
    expect(second.durationByPitchClass[7]).toBe(480);
    expect(second.sourceDurationByPitchClass[0]).toBe(960);
    expect(second.accentByPitchClass[0]).toBe(0);
  });

  it("summarizes segment bass and event coverage without double-counting pitch classes", () => {
    const events = [
      event(0, 0, 240, 1, [note("c", 0, 60, 240, false, 0, 1), note("e", 4, 64, 240, false, 0, 1)]),
      event(1, 240, 720, 0.25, [note("g", 7, 55, 480, false, 240, 0.25), note("c2", 0, 72, 480, false, 240, 0.25)]),
    ];
    const evidence = createPaperSemiCrfRangeEvidenceCache(events).forRange(0, 2);

    expect(evidence.segmentBass?.soundingMidi).toBe(55);
    expect(evidence.durationBassByPitchClass[0]).toBe(240);
    expect(evidence.durationBassByPitchClass[7]).toBe(480);
    expect(evidence.accentBassByPitchClass[0]).toBe(1);
    expect(evidence.accentBassByPitchClass[7]).toBe(0.25);
    expect(evidence.segmentDurationCoverage([0, 4])).toEqual({
      matching: 720,
      total: 720,
      matchedCount: 2,
      eventCount: 2,
    });
  });

  it("returns the same immutable evidence object for a repeated range", () => {
    const events = [event(0, 0, 480, 1, [note("c", 0, 60, 480, false, 0, 1)])];
    const cache = createPaperSemiCrfRangeEvidenceCache(events);

    expect(cache.forRange(0, 1)).toBe(cache.forRange(0, 1));
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
  sourceDurationTicks: number,
  heldFromPrevious: boolean,
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
    sourceDurationTicks,
    heldFromPrevious,
    metricAccent,
    isBass: false,
  };
}
