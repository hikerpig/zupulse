import { describe, expect, it } from "vitest";
import {
  UnsupportedScoreFormatError,
  detectScoreFormat,
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

  it("rejects unsupported extensions", () => {
    expect(() => detectScoreFormat("chart.pdf")).toThrow(UnsupportedScoreFormatError);
  });
});

describe("isSupportedScoreFile", () => {
  it("returns true only for first-version score formats", () => {
    expect(isSupportedScoreFile("riff.gp5")).toBe(true);
    expect(isSupportedScoreFile("piano.mid")).toBe(true);
    expect(isSupportedScoreFile("scan.pdf")).toBe(false);
    expect(isSupportedScoreFile("archive.zip")).toBe(false);
  });
});
