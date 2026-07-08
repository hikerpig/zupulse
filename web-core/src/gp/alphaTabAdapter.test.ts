import { describe, expect, it } from "vitest";
import { loadGpScore, summarizeGpScore } from "./alphaTabAdapter";

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
