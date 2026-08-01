import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as alphaTab from "@coderline/alphatab";
import { describe, expect, it } from "vitest";
import { buildAlphaTabPianoKeyTimeline } from "../alphaTabPianoKeyTimeline";

const fixture = fileURLToPath(new URL("../../../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));

describe("buildAlphaTabPianoKeyTimeline", () => {
  it("generates independent expanded right and left hand events without mutating the score", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(readFileSync(fixture));
    const originalCounts = score.tracks[0]!.staves.map(countNotes);

    const timeline = buildAlphaTabPianoKeyTimeline(score, new alphaTab.Settings(), {
      trackId: "track-0",
      rightStaffId: "track-0:staff-0",
      leftStaffId: "track-0:staff-1",
    });

    expect(timeline.filter((event) => event.hand === "right").length).toBeGreaterThan(0);
    expect(timeline.filter((event) => event.hand === "left").length).toBeGreaterThan(0);
    expect(timeline.every((event) => event.endTick > event.startTick)).toBe(true);
    expect(timeline.every((event) => event.pitch >= 0 && event.pitch <= 127)).toBe(true);
    expect(timeline.some((event) => event.startTick >= 16320)).toBe(true);
    expect(score.tracks[0]!.staves.map(countNotes)).toEqual(originalCounts);
  });

  it("keeps a tied note as one continuous playback event", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(readFileSync(fixture));

    const timeline = buildAlphaTabPianoKeyTimeline(score, new alphaTab.Settings(), {
      trackId: "track-0",
      rightStaffId: "track-0:staff-0",
      leftStaffId: "track-0:staff-1",
    });

    expect(timeline).toContainEqual({
      pitch: 83,
      startTick: 420480,
      endTick: 422400,
      hand: "right",
    });
    expect(timeline).not.toContainEqual(
      expect.objectContaining({
        pitch: 83,
        startTick: 421920,
        hand: "right",
      }),
    );
  });
});

function countNotes(staff: alphaTab.model.Staff): number {
  return staff.bars.reduce(
    (barTotal, bar) =>
      barTotal +
      bar.voices.reduce(
        (voiceTotal, voice) => voiceTotal + voice.beats.reduce((beatTotal, beat) => beatTotal + beat.notes.length, 0),
        0,
      ),
    0,
  );
}
