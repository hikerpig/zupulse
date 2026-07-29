import { describe, expect, it } from "vitest";
import { UnsupportedScoreFormatError, detectScoreFormat, getScoreFormatHint, isSupportedScoreFile } from "../format";

describe("detectScoreFormat", () => {
  it("detects every supported extension case-insensitively", () => {
    const examples = [
      ["song.gp3", "gp"],
      ["song.GP4", "gp"],
      ["song.gp5", "gp"],
      ["song.gpx", "gp"],
      ["song.gp", "gp"],
      ["lesson.mid", "midi"],
      ["lesson.MIDI", "midi"],
      ["score.musicxml", "musicxml"],
      ["score.MXL", "musicxml"],
    ] as const;

    for (const [fileName, format] of examples) {
      expect(detectScoreFormat(fileName), fileName).toBe(format);
    }
  });

  it("keeps generic XML, disguised, and extensionless files unconfirmed", () => {
    expect(getScoreFormatHint("score.xml")).toBeUndefined();
    expect(getScoreFormatHint("score.musicxml.exe")).toBeUndefined();
    expect(getScoreFormatHint("score")).toBeUndefined();
    expect(() => detectScoreFormat("score.xml")).toThrow(UnsupportedScoreFormatError);
  });

  it("rejects unsupported extensions", () => {
    expect(() => detectScoreFormat("chart.pdf")).toThrow(UnsupportedScoreFormatError);
  });
});

describe("isSupportedScoreFile", () => {
  it("returns true only for first-version score formats", () => {
    expect(isSupportedScoreFile("riff.gp5")).toBe(true);
    expect(isSupportedScoreFile("piano.mid")).toBe(true);
    expect(isSupportedScoreFile("quartet.musicxml")).toBe(true);
    expect(isSupportedScoreFile("quartet.mxl")).toBe(true);
    expect(isSupportedScoreFile("scan.pdf")).toBe(false);
    expect(isSupportedScoreFile("archive.zip")).toBe(false);
  });
});
