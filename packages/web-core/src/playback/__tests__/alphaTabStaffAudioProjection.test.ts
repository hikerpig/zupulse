import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as alphaTab from "@coderline/alphatab";
import { describe, expect, it } from "vitest";
import { buildAlphaTabStaffAudioProjection } from "../alphaTabStaffAudioProjection";

const fixture = fileURLToPath(new URL("../../../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));

describe("buildAlphaTabStaffAudioProjection", () => {
  it("builds independent staff MIDI projections without mutating the loaded score", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(readFileSync(fixture));
    const originalCounts = score.tracks[0]!.staves.map(countNotes);

    const right = buildAlphaTabStaffAudioProjection(score, new alphaTab.Settings(), new Set(["track-0:staff-0"]));
    const left = buildAlphaTabStaffAudioProjection(score, new alphaTab.Settings(), new Set(["track-0:staff-1"]));
    const both = buildAlphaTabStaffAudioProjection(
      score,
      new alphaTab.Settings(),
      new Set(["track-0:staff-0", "track-0:staff-1"]),
    );

    expect(countNoteOnEvents(right.midiFile)).toBeGreaterThan(0);
    expect(countNoteOnEvents(left.midiFile)).toBeGreaterThan(0);
    expect(countNoteOnEvents(right.midiFile)).not.toBe(countNoteOnEvents(left.midiFile));
    expect(countNoteOnEvents(both.midiFile)).toBe(countNoteOnEvents(right.midiFile) + countNoteOnEvents(left.midiFile));
    expect(score.tracks[0]!.staves.map(countNotes)).toEqual(originalCounts);
  });

  it("rejects unknown staff IDs instead of producing partial audio", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(readFileSync(fixture));

    expect(() =>
      buildAlphaTabStaffAudioProjection(score, new alphaTab.Settings(), new Set(["track-0:staff-99"])),
    ).toThrow("Unknown alphaTab staff projection target");
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

function countNoteOnEvents(midiFile: alphaTab.midi.MidiFile): number {
  return midiFile.events.filter((event) => event instanceof alphaTab.midi.NoteOnEvent).length;
}
