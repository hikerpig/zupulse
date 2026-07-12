import { describe, expect, it } from "vitest";
import {
  UnsupportedScoreFormatError,
  detectScoreFormat,
  getScoreFormatHint,
  isSupportedScoreFile,
} from "./format";

describe("detectScoreFormat", () => {
  it("detects supported Guitar Pro extensions case-insensitively", () => {
    expect(detectScoreFormat("song.gp3")).toBe("gp");
    expect(detectScoreFormat("song.GP4")).toBe("gp");
    expect(detectScoreFormat("song.gp5")).toBe("gp");
    expect(detectScoreFormat("song.gpx")).toBe("gp");
    expect(detectScoreFormat("song.gp")).toBe("gp");
  });

  it("detects supported MIDI extensions case-insensitively", () => {
    expect(detectScoreFormat("lesson.mid")).toBe("midi");
    expect(detectScoreFormat("lesson.MIDI")).toBe("midi");
  });

  it("detects MusicXML-specific extensions case-insensitively", () => {
    expect(detectScoreFormat("score.musicxml")).toBe("musicxml");
    expect(detectScoreFormat("score.MXL")).toBe("musicxml");
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
