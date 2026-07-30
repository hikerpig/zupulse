import { describe, expect, it } from "vitest";
import { PdfOmrError } from "../errors";
import { buildTempoTimeline } from "../midi/build-tempo-timeline";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import { midiFile, midiTrack, noteOff, noteOn, tempo } from "./fixtures/midi-builder";

describe("buildTempoTimeline", () => {
  it("assumes 120 BPM from tick zero when the MIDI has no initial tempo", () => {
    const document = parseStandardMidi(midiFile({ tracks: [midiTrack(noteOn(0, 0, 60, 64), noteOff(480, 0, 60))] }));

    const result = buildTempoTimeline(document);

    expect(result.timeline.changes).toEqual([
      { tick: 0, microsecondsPerQuarter: 500_000, origin: "default", sources: [] },
    ]);
    expect(result.tickToSeconds(480)).toBe(0.5);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "MIDI_DEFAULT_TEMPO_ASSUMED", severity: "info" }),
    ]);
  });

  it("integrates seconds across piecewise tempo changes", () => {
    const document = parseStandardMidi(
      midiFile({
        tracks: [midiTrack(tempo(0, 500_000), tempo(480, 1_000_000), noteOn(480, 0, 60, 64))],
      }),
    );

    const result = buildTempoTimeline(document);

    expect(result.timeline.segments).toEqual([
      { startTick: 0, endTick: 480, startSeconds: 0, microsecondsPerQuarter: 500_000 },
      { startTick: 480, startSeconds: 0.5, microsecondsPerQuarter: 1_000_000 },
    ]);
    expect(result.tickToSeconds(960)).toBe(1.5);
    expect(result.diagnostics).toEqual([]);
  });

  it("deduplicates identical same-tick tempo facts and preserves every source", () => {
    const document = parseStandardMidi(
      midiFile({
        format: 1,
        tracks: [midiTrack(tempo(0, 500_000)), midiTrack(tempo(0, 500_000))],
      }),
    );

    const result = buildTempoTimeline(document);

    expect(result.timeline.changes).toHaveLength(1);
    expect(result.timeline.changes[0]).toMatchObject({
      tick: 0,
      microsecondsPerQuarter: 500_000,
      origin: "midi",
      sources: [
        { trackIndex: 0, eventIndex: 0, absoluteTick: 0 },
        { trackIndex: 1, eventIndex: 0, absoluteTick: 0 },
      ],
    });
  });

  it("rejects conflicting same-tick tempo facts", () => {
    const document = parseStandardMidi(
      midiFile({
        format: 1,
        tracks: [midiTrack(tempo(0, 500_000)), midiTrack(tempo(0, 600_000))],
      }),
    );

    expect(() => buildTempoTimeline(document)).toThrowError(
      expect.objectContaining<PdfOmrError>({
        code: "INVALID_INPUT",
        context: expect.objectContaining({ reason: "conflicting-tempo-at-tick", tick: 0 }),
      }),
    );
  });
});
