import { describe, expect, it } from "vitest";
import type { PaperSemiCrfEvent, PaperSemiCrfEventNote } from "../paper-semi-crf-events";
import { extractPaperSemiCrfSegmentFeatures, paperSemiCrfConsistencyBin } from "../paper-semi-crf-features";
import { createPaperSemiCrfLabelInventory, type PaperSemiCrfSupportedLabel } from "../paper-semi-crf-labels";

describe("paper semi-CRF segment features", () => {
  it("matches the reference purity, coverage, and beginning-accent feature values", () => {
    const label = supportedLabel("C:maj");
    const events = [
      event(0, 0, 480, 1, [
        note("c", 0, 60, 960, false, 1),
        note("e", 4, 64, 480, false, 1),
        note("fs", 6, 66, 480, false, 1),
      ]),
      event(1, 480, 960, 0.125, [note("c", 0, 60, 960, true, 0.125), note("g", 7, 67, 480, false, 0.125, 480)]),
    ];

    const features = extractPaperSemiCrfSegmentFeatures({
      events,
      segment: { startEvent: 0, endEvent: 2, labelId: label.id },
      label,
    });

    expect(features.slice(0, 7)).toEqual([
      "PURITY_80",
      "ACCENTED_PURITY_70",
      "DURATION_PURITY_80",
      "ROOT_COVERED",
      "THIRD_COVERED",
      "FIFTH_COVERED",
      "ALL_NOTES_COVERED",
    ]);
    expect(features).toContain("BEGINNING_ACCENTED_1.0");
  });

  it("uses both seventh alternatives from generic-added-notes and reports missing added tones", () => {
    const label = supportedLabel("C:maj7");
    const covered = [
      event(0, 0, 480, 1, [
        note("c", 0, 60, 480, false, 1),
        note("e", 4, 64, 480, false, 1),
        note("g", 7, 67, 480, false, 1),
        note("bb", 10, 70, 480, false, 1),
      ]),
    ];
    const missing = [
      event(0, 0, 480, 1, [
        note("c", 0, 60, 480, false, 1),
        note("e", 4, 64, 480, false, 1),
        note("g", 7, 67, 480, false, 1),
      ]),
    ];

    expect(
      extractPaperSemiCrfSegmentFeatures({
        events: covered,
        segment: { startEvent: 0, endEvent: 1, labelId: label.id },
        label,
      }),
    ).toContain("ADDED_NOTE_COVERED");
    expect(
      extractPaperSemiCrfSegmentFeatures({
        events: missing,
        segment: { startEvent: 0, endEvent: 1, labelId: label.id },
        label,
      }),
    ).toContain("ADDED_NOTE_NOT_COVERED");
  });

  it("matches reference consistency bins at exact boundaries", () => {
    expect(paperSemiCrfConsistencyBin({ matching: 0, total: 10, matchedCount: 0, noteCount: 10 })).toBe(0);
    expect(paperSemiCrfConsistencyBin({ matching: 1, total: 10, matchedCount: 1, noteCount: 10 })).toBe(10);
    expect(paperSemiCrfConsistencyBin({ matching: 1.0001, total: 10, matchedCount: 1, noteCount: 10 })).toBe(20);
    expect(paperSemiCrfConsistencyBin({ matching: 10, total: 10, matchedCount: 10, noteCount: 10 })).toBe(101);
  });

  it("extracts weighted coverage and bass-role families with reference bins", () => {
    const label = supportedLabel("C:maj");
    const events = [
      event(0, 0, 480, 1, [note("c", 0, 60, 480, false, 1), note("e1", 4, 64, 480, false, 1)]),
      event(1, 480, 1440, 0.25, [note("e2", 4, 64, 960, false, 0.25, 480), note("g", 7, 67, 960, false, 0.25, 480)]),
    ];

    const features = extractPaperSemiCrfSegmentFeatures({
      events,
      segment: { startEvent: 0, endEvent: 2, labelId: label.id },
      label,
    });

    expect(features).toEqual(
      expect.arrayContaining([
        "DURATION_ROOT_COVERED_20",
        "SEGMENT_DURATION_ROOT_COVERED_40",
        "DURATION_THIRD_COVERED_50",
        "SEGMENT_DURATION_THIRD_COVERED_101",
        "DURATION_FIFTH_COVERED_40",
        "SEGMENT_DURATION_FIFTH_COVERED_70",
        "ACCENT_ROOT_COVERED_40",
        "ACCENT_THIRD_COVERED_50",
        "ACCENT_FIFTH_COVERED_10",
        "FIRST_BASS_IS_ROOT",
        "SEGMENT_BASS_IS_ROOT",
        "DURATION_BASS_IS_ROOT_40",
        "DURATION_BASS_IS_THIRD_70",
        "ACCENT_BASS_IS_ROOT_80",
        "ACCENT_BASS_IS_THIRD_20",
      ]),
    );
  });

  it("detects an added tone whose source duration exceeds the root", () => {
    const label = supportedLabel("C:maj7");
    const events = [event(0, 0, 480, 1, [note("c", 0, 60, 480, false, 1), note("bb", 10, 70, 960, false, 1)])];

    expect(
      extractPaperSemiCrfSegmentFeatures({
        events,
        segment: { startEvent: 0, endEvent: 1, labelId: label.id },
        label,
      }),
    ).toContain("DURATION_ADDED_NOTE_GREATER_THAN_ROOT");
  });
});

function supportedLabel(referenceLabel: string): PaperSemiCrfSupportedLabel {
  const label = createPaperSemiCrfLabelInventory([referenceLabel]).labels[0];
  if (label?.status !== "supported") throw new Error(`unsupported test label: ${referenceLabel}`);
  return label;
}

function event(
  index: number,
  startTick: number,
  endTick: number,
  metricAccent: number,
  notes: PaperSemiCrfEventNote[],
): PaperSemiCrfEvent {
  const bassMidi = Math.min(...notes.flatMap((candidate) => candidate.soundingMidi ?? []));
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
    notes: notes.map((candidate) => ({ ...candidate, isBass: candidate.soundingMidi === bassMidi })),
    ...(notes.length === 0
      ? {}
      : { bassPitchClass: notes.find((candidate) => candidate.soundingMidi === bassMidi)!.soundingPitchClass }),
  };
}

function note(
  id: string,
  soundingPitchClass: number,
  soundingMidi: number,
  sourceDurationTicks: number,
  heldFromPrevious: boolean,
  metricAccent: number,
  onsetTick = 0,
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
