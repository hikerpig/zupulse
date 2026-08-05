import { describe, expect, it } from "vitest";
import {
  midiImportReportSchema,
  performanceEvidenceSchema,
  rawMidiDocumentSchema,
  type PerformanceEvidence,
  type RawMidiDocument,
} from "../midi/schemas";

const sha256 = "a".repeat(64);

describe("MIDI persisted schemas", () => {
  it("accepts strict raw MIDI evidence with stable source coordinates", () => {
    const document: RawMidiDocument = {
      schemaVersion: "1.0.0",
      header: { format: 0, trackCount: 1, ticksPerQuarter: 480 },
      tracks: [
        {
          trackIndex: 0,
          byteLength: 8,
          endTick: 480,
          events: [
            {
              type: "note-on",
              trackIndex: 0,
              eventIndex: 0,
              deltaTick: 0,
              absoluteTick: 0,
              channel: 0,
              pitch: 60,
              velocity: 96,
            },
            {
              type: "note-off",
              trackIndex: 0,
              eventIndex: 1,
              deltaTick: 480,
              absoluteTick: 480,
              channel: 0,
              pitch: 60,
              velocity: 0,
              byte9: true,
            },
          ],
        },
      ],
    };

    expect(rawMidiDocumentSchema.parse(document)).toEqual(document);
    expect(() =>
      rawMidiDocumentSchema.parse({
        ...document,
        tracks: [{ ...document.tracks[0], unknown: true }],
      }),
    ).toThrow();
  });

  it("rejects invalid channel data and source coordinates", () => {
    const base = {
      schemaVersion: "1.0.0",
      header: { format: 0, trackCount: 1, ticksPerQuarter: 480 },
      tracks: [
        {
          trackIndex: 0,
          byteLength: 4,
          endTick: 0,
          events: [
            {
              type: "note-on",
              trackIndex: 0,
              eventIndex: 0,
              deltaTick: 0,
              absoluteTick: 0,
              channel: 16,
              pitch: 128,
              velocity: 128,
            },
          ],
        },
      ],
    };

    expect(() => rawMidiDocumentSchema.parse(base)).toThrow();
    expect(() =>
      rawMidiDocumentSchema.parse({
        ...base,
        tracks: [
          {
            ...base.tracks[0],
            events: [{ ...base.tracks[0]!.events[0], channel: 0, pitch: 60, velocity: 64, eventIndex: -1 }],
          },
        ],
      }),
    ).toThrow();
  });

  it("keeps key release and pedal-adjusted sound-off distinct", () => {
    const evidence: PerformanceEvidence = {
      schemaVersion: "1.0.0",
      source: {
        fileName: "score.mid",
        sha256,
        sizeBytes: 42,
        smfFormat: 0,
        trackCount: 1,
        ticksPerQuarter: 480,
      },
      tempoTimeline: {
        changes: [
          {
            tick: 0,
            microsecondsPerQuarter: 500_000,
            origin: "default",
            sources: [],
          },
        ],
        segments: [{ startTick: 0, startSeconds: 0, microsecondsPerQuarter: 500_000 }],
      },
      timeSignatures: [],
      tracks: [{ trackIndex: 0, endTick: 960, channels: [0], programs: [] }],
      notes: [
        {
          id: "midi-t0-e0",
          trackIndex: 0,
          channel: 0,
          noteIndex: 0,
          pitch: 60,
          velocity: 96,
          onsetTick: 0,
          keyReleaseTick: 480,
          soundOffTick: 960,
          onsetSeconds: 0,
          keyReleaseSeconds: 0.5,
          soundOffSeconds: 1,
          source: {
            noteOn: { trackIndex: 0, eventIndex: 0, absoluteTick: 0 },
            noteOff: { trackIndex: 0, eventIndex: 2, absoluteTick: 480 },
          },
          flags: ["pedal-extended"],
        },
      ],
      controls: [],
      diagnostics: [],
    };

    expect(performanceEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(() =>
      performanceEvidenceSchema.parse({
        ...evidence,
        notes: [{ ...evidence.notes[0], durationSeconds: 1 }],
      }),
    ).toThrow();
  });

  it("accepts a successful import command report", () => {
    expect(
      midiImportReportSchema.parse({
        schemaVersion: "1.0.0",
        command: "import-midi",
        status: "succeeded",
        runId: "aaaaaaaaaaaaaaaa-midi-import",
        inputSha256: sha256,
        rawMidiSha256: sha256,
        performanceEvidenceSha256: sha256,
      }),
    ).toMatchObject({ command: "import-midi", status: "succeeded" });
  });
});
