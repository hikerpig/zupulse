import { describe, expect, it } from "vitest";
import { PdfOmrError } from "../errors";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import {
  concat,
  controlChange,
  midiFile,
  midiTrack,
  noteOff,
  noteOn,
  programChange,
  rawEvent,
  tempo,
  timeSignature,
  trackName,
  velocityZeroNoteOn,
} from "./fixtures/midi-builder";

describe("parseStandardMidi", () => {
  it("projects format 1 tracks and supported events into RawMidiDocument", () => {
    const bytes = midiFile({
      format: 1,
      tracks: [
        midiTrack(trackName(0, "Conductor"), tempo(0, 500_000), timeSignature(0, 4, 2)),
        midiTrack(
          trackName(0, "Piano"),
          programChange(0, 0, 0),
          controlChange(0, 0, 64, 127),
          noteOn(0, 0, 60, 96),
          noteOff(480, 0, 60),
        ),
      ],
    });

    const document = parseStandardMidi(bytes);

    expect(document.header).toEqual({ format: 1, trackCount: 2, ticksPerQuarter: 480 });
    expect(document.tracks).toHaveLength(2);
    expect(document.tracks[0]).toMatchObject({
      trackIndex: 0,
      endTick: 0,
      events: [
        { type: "track-name", text: "Conductor", absoluteTick: 0 },
        { type: "tempo", microsecondsPerQuarter: 500_000, absoluteTick: 0 },
        { type: "time-signature", numerator: 4, denominator: 4, absoluteTick: 0 },
        { type: "end-of-track", absoluteTick: 0 },
      ],
    });
    expect(document.tracks[1]?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "program-change", program: 0 }),
        expect.objectContaining({ type: "control-change", controller: 64, value: 127 }),
        expect.objectContaining({ type: "note-on", pitch: 60, velocity: 96, absoluteTick: 0 }),
        expect.objectContaining({ type: "note-off", pitch: 60, absoluteTick: 480 }),
      ]),
    );
  });

  it("preserves running status and velocity-zero note-off encoding facts", () => {
    const bytes = midiFile({
      tracks: [
        midiTrack(noteOn(0, 0, 60, 96), rawEvent(120, 64, 80), velocityZeroNoteOn(120, 0, 60), rawEvent(120, 64, 0)),
      ],
    });

    const events = parseStandardMidi(bytes).tracks[0]!.events;

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "note-on", pitch: 64, running: true, absoluteTick: 120 }),
        expect.objectContaining({ type: "note-off", pitch: 60, byte9: true, absoluteTick: 240 }),
        expect.objectContaining({
          type: "note-off",
          pitch: 64,
          byte9: true,
          running: true,
          absoluteTick: 360,
        }),
      ]),
    );
  });

  it("hashes SysEx payloads instead of copying them into persisted JSON", () => {
    const bytes = midiFile({
      tracks: [midiTrack(rawEvent(0, 0xf0, 0x03, 0x01, 0x02, 0x03))],
    });

    expect(parseStandardMidi(bytes).tracks[0]?.events[0]).toMatchObject({
      type: "sysex",
      continuation: false,
      dataLength: 3,
      dataSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    ["format 2", midiFile({ format: 2, tracks: [midiTrack()] }), "unsupported-midi-format"],
    [
      "SMPTE division",
      (() => {
        const bytes = midiFile({ tracks: [midiTrack()] });
        bytes[12] = 0xe7;
        bytes[13] = 0x28;
        return bytes;
      })(),
      "unsupported-smpte-division",
    ],
    [
      "truncated track chunk",
      (() => {
        const bytes = midiFile({ tracks: [midiTrack(noteOn(0, 0, 60, 64))] });
        return bytes.slice(0, bytes.length - 2);
      })(),
      "chunk-out-of-bounds",
    ],
    [
      "unexpected trailing bytes",
      concat(midiFile({ tracks: [midiTrack()] }), new Uint8Array([0])),
      "invalid-track-chunk",
    ],
    [
      "five-byte variable-length delta",
      midiFile({
        tracks: [new Uint8Array([0x81, 0x80, 0x80, 0x80, 0x00, 0xff, 0x2f, 0x00])],
      }),
      "invalid-variable-length-quantity",
    ],
    [
      "running status without a preceding channel status",
      midiFile({ tracks: [new Uint8Array([0x00, 0x3c, 0x40])] }),
      "invalid-running-status",
    ],
  ])("rejects %s with a stable reason", (_name, bytes, reason) => {
    expect(() => parseStandardMidi(bytes)).toThrowError(
      expect.objectContaining<PdfOmrError>({
        code: "INVALID_INPUT",
        context: expect.objectContaining({ reason }),
      }),
    );
  });

  it("enforces configured file, track, event, and SysEx limits", () => {
    const oneNote = midiFile({ tracks: [midiTrack(noteOn(0, 0, 60, 64), noteOff(1, 0, 60))] });
    expectInvalidReason(() => parseStandardMidi(oneNote, { maxFileBytes: 8 }), "resource-limit-exceeded");
    expectInvalidReason(() => parseStandardMidi(oneNote, { maxTracks: 0 }), "resource-limit-exceeded");
    expectInvalidReason(() => parseStandardMidi(oneNote, { maxEvents: 1 }), "resource-limit-exceeded");

    const sysex = midiFile({ tracks: [midiTrack(rawEvent(0, 0xf0, 0x03, 1, 2, 3))] });
    expectInvalidReason(() => parseStandardMidi(sysex, { maxSysexBytes: 2 }), "resource-limit-exceeded");
  });
});

function expectInvalidReason(action: () => unknown, reason: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PdfOmrError);
    expect((error as PdfOmrError).context).toMatchObject({ reason });
    return;
  }
  throw new Error("expected parser to reject input");
}
