import { describe, expect, it } from "vitest";
import { parseCmuChordLabel, parseCmuChordLabels, parseStandardMidi } from "../cmuCmaParser";

describe("CMU CMA parser", () => {
  it("parses chord qualities, extensions, alterations, and slash bass", () => {
    expect(parseCmuChordLabel("Am")).toMatchObject({
      root: { step: "A", alter: 0 },
      kind: "minor",
      degrees: [],
    });
    expect(parseCmuChordLabel("C7")).toMatchObject({ kind: "dominant", extension: 7 });
    expect(parseCmuChordLabel("F#m7b5/C#")).toMatchObject({
      root: { step: "F", alter: 1 },
      kind: "half-diminished",
      extension: 7,
      degrees: [{ operation: "alter", value: 5, alter: -1 }],
      bass: { step: "C", alter: 1 },
    });
    expect(parseCmuChordLabel("N")).toBeNull();
  });

  it("parses timestamped chord labels and ignores unrelated lines", () => {
    expect(parseCmuChordLabels("0 Am\n6315 Em/B\nnot a label\n")).toEqual([
      expect.objectContaining({ startMs: 0, label: "Am" }),
      expect.objectContaining({ startMs: 6315, label: "Em/B" }),
    ]);
  });

  it("parses a format-0 MIDI note and converts ticks to milliseconds", () => {
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12, 0, 0x90, 60, 100, 96,
      0x80, 60, 0, 0, 0xff, 0x2f, 0,
    ]);
    expect(parseStandardMidi(bytes)).toEqual([{ startMs: 0, endMs: 500, midi: 60, channel: 0 }]);
  });
});
