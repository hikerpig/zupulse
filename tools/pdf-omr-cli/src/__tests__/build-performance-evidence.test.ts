import { describe, expect, it } from "vitest";
import { buildPerformanceEvidence } from "../midi/build-performance-evidence";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import {
  controlChange,
  midiFile,
  midiTrack,
  noteOff,
  noteOn,
  programChange,
  tempo,
  timeSignature,
  trackName,
} from "./fixtures/midi-builder";

const source = {
  fileName: "score.mid",
  sha256: "a".repeat(64),
  sizeBytes: 128,
};

describe("buildPerformanceEvidence", () => {
  it("projects complete notes, tracks, controls, meter, and seconds", () => {
    const document = parseStandardMidi(
      midiFile({
        tracks: [
          midiTrack(
            trackName(0, "Piano"),
            programChange(0, 0, 0),
            tempo(0, 500_000),
            timeSignature(0, 4, 2),
            controlChange(0, 0, 1, 64),
            noteOn(0, 0, 60, 96),
            noteOff(480, 0, 60),
          ),
        ],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.source).toMatchObject({ ...source, smfFormat: 0, trackCount: 1, ticksPerQuarter: 480 });
    expect(evidence.tracks).toEqual([
      {
        trackIndex: 0,
        name: "Piano",
        endTick: 480,
        channels: [0],
        programs: [
          {
            channel: 0,
            program: 0,
            tick: 0,
            seconds: 0,
            source: { trackIndex: 0, eventIndex: 1, absoluteTick: 0 },
          },
        ],
      },
    ]);
    expect(evidence.timeSignatures).toEqual([
      {
        tick: 0,
        numerator: 4,
        denominator: 4,
        sources: [{ trackIndex: 0, eventIndex: 3, absoluteTick: 0 }],
      },
    ]);
    expect(evidence.controls).toEqual([expect.objectContaining({ controller: 1, value: 64, tick: 0, seconds: 0 })]);
    expect(evidence.notes).toEqual([
      expect.objectContaining({
        id: "midi-t0-e5",
        noteIndex: 0,
        pitch: 60,
        velocity: 96,
        onsetTick: 0,
        keyReleaseTick: 480,
        soundOffTick: 480,
        onsetSeconds: 0,
        keyReleaseSeconds: 0.5,
        soundOffSeconds: 0.5,
        flags: [],
      }),
    ]);
  });

  it("pairs overlapping same-pitch notes FIFO and marks both notes", () => {
    const document = parseStandardMidi(
      midiFile({
        tracks: [midiTrack(noteOn(0, 0, 60, 90), noteOn(120, 0, 60, 80), noteOff(120, 0, 60), noteOff(120, 0, 60))],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.notes).toHaveLength(2);
    expect(evidence.notes[0]).toMatchObject({
      id: "midi-t0-e0",
      onsetTick: 0,
      keyReleaseTick: 240,
      flags: ["overlapping-same-pitch"],
    });
    expect(evidence.notes[1]).toMatchObject({
      id: "midi-t0-e1",
      onsetTick: 120,
      keyReleaseTick: 360,
      flags: ["overlapping-same-pitch"],
    });
    expect(evidence.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MIDI_OVERLAPPING_SAME_PITCH" })]),
    );
  });

  it("omits incomplete notes while preserving structured diagnostics", () => {
    const document = parseStandardMidi(
      midiFile({
        tracks: [midiTrack(noteOff(0, 0, 61), noteOn(0, 0, 60, 80))],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.notes).toEqual([]);
    expect(evidence.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MIDI_UNMATCHED_NOTE_OFF" }),
        expect.objectContaining({ code: "MIDI_DANGLING_NOTE_ON" }),
      ]),
    );
  });

  it("keeps key release distinct from pedal-adjusted sound-off", () => {
    const document = parseStandardMidi(
      midiFile({
        tracks: [
          midiTrack(
            controlChange(0, 0, 64, 127),
            noteOn(0, 0, 60, 96),
            noteOff(480, 0, 60),
            controlChange(480, 0, 64, 0),
          ),
        ],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.notes[0]).toMatchObject({
      keyReleaseTick: 480,
      soundOffTick: 960,
      keyReleaseSeconds: 0.5,
      soundOffSeconds: 1,
      flags: ["pedal-extended"],
    });
  });

  it("does not invent cross-track same-tick pedal ordering", () => {
    const document = parseStandardMidi(
      midiFile({
        format: 1,
        tracks: [
          midiTrack(controlChange(480, 0, 64, 127), controlChange(480, 0, 64, 0)),
          midiTrack(noteOn(0, 0, 60, 96), noteOff(480, 0, 60)),
        ],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.notes[0]).toMatchObject({
      keyReleaseTick: 480,
      soundOffTick: 480,
      flags: ["simultaneous-pedal-order-ambiguous"],
    });
    expect(evidence.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MIDI_SIMULTANEOUS_PEDAL_ORDER_AMBIGUOUS" })]),
    );
  });

  it("preserves percussion-channel notes and conflicting meter evidence", () => {
    const document = parseStandardMidi(
      midiFile({
        format: 1,
        tracks: [
          midiTrack(timeSignature(0, 4, 2)),
          midiTrack(timeSignature(0, 3, 2), noteOn(0, 9, 36, 100), noteOff(120, 9, 36)),
        ],
      }),
    );

    const evidence = buildPerformanceEvidence(document, source);

    expect(evidence.notes[0]?.flags).toContain("percussion-channel");
    expect(evidence.timeSignatures).toHaveLength(2);
    expect(evidence.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MIDI_TIME_SIGNATURE_CONFLICT" })]),
    );
  });
});
