import { describe, expect, it } from "vitest";
import { detectGpEncoding, loadGpScore, summarizeGpScore } from "./alphaTabAdapter";

describe("detectGpEncoding", () => {
  it("returns gbk for GP3-5 binary format", () => {
    const header = new TextEncoder().encode("FICHIER GUITAR PRO v5.00");
    const bytes = new Uint8Array(100);
    bytes.set(header);
    expect(detectGpEncoding(bytes)).toBe("gbk");
  });

  it("returns utf-8 for GPX/GP zip-based format", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(detectGpEncoding(bytes)).toBe("utf-8");
  });

  it("defaults to utf-8 for unknown format", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(detectGpEncoding(bytes)).toBe("utf-8");
  });
});

describe("loadGpScore", () => {
  it("delegates bytes to an injectable alphaTab loader", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const score = {
      title: "Song",
      artist: "Artist",
      tracks: [{ name: "Guitar" }, { name: "Bass" }],
      masterBars: [{}, {}],
      tempo: 128,
    };

    const loaded = loadGpScore(bytes, input => {
      expect(input).toEqual(bytes);
      return score;
    });

    expect(loaded).toBe(score);
  });
});

describe("summarizeGpScore", () => {
  it("extracts a stable summary without exposing alphaTab internals", () => {
    expect(
      summarizeGpScore({
        title: "Song",
        artist: "Artist",
        tracks: [{ name: "Guitar" }, { name: "Bass" }],
        masterBars: [{}, {}, {}],
        tempo: 96,
      }),
    ).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 96,
    });
  });

  it("uses safe defaults for sparse alphaTab scores", () => {
    expect(summarizeGpScore({})).toEqual({
      title: "Untitled",
      trackCount: 0,
      masterBarCount: 0,
    });
  });
});
