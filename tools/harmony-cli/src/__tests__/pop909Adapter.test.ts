import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePop909Chord, parsePop909Piece } from "../adapters/pop909";
import { evaluatePop909Corpus } from "../adapters/pop909Evaluation";

const midi = new Uint8Array([
  0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12, 0, 0x90, 60, 100, 96,
  0x80, 60, 0, 0, 0xff, 0x2f, 0,
]);

describe("POP909 adapter", () => {
  it("canonicalizes the complete POP909 quality and inversion notation", () => {
    expect(parsePop909Chord("F#:maj7/3")).toMatchObject({
      root: { step: "F", alter: 1 },
      kind: "major",
      extension: 7,
      bass: { step: "A", alter: 1 },
    });
    expect(parsePop909Chord("C:min7/b7")).toMatchObject({
      kind: "minor",
      extension: 7,
      bass: { step: "B", alter: -1 },
    });
    expect(parsePop909Chord("N")).toBeNull();
    expect(() => parsePop909Chord("C:minmaj7")).toThrow("unsupported POP909 quality");
  });

  it("aligns MIDI notes and chord ranges through an independent beat grid", () => {
    const piece = parsePop909Piece({
      corpus: "pop909",
      groupId: "001",
      midi,
      beats: "0 1 1\n0.5 0 0\n1 1 1\n",
      chords: "0\t0.5\tC:maj\n0.5\t1\tG:7/5\n",
    });

    expect(piece.input).toMatchObject({
      ticksPerQuarter: 480,
      measures: [
        { index: 0, durationTicks: 480 },
        { index: 1, durationTicks: 480 },
      ],
    });
    expect(piece.input.tracks[0]?.staves[0]?.notes[0]).toMatchObject({
      moment: { measureIndex: 0, offsetTicks: 0 },
      durationTicks: 480,
      soundingMidi: 60,
    });
    expect(piece.gold).toMatchObject([
      { range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 0 } } },
      { range: { start: { measureIndex: 1, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 480 } } },
    ]);
  });

  it("evaluates songs as isolated split groups", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "zupulse-pop909-"));
    try {
      await mkdir(resolve(root, "001"));
      await Promise.all([
        writeFile(resolve(root, "001/001.mid"), midi),
        writeFile(resolve(root, "001/beat_midi.txt"), "0 1 1\n0.5 0 0\n1 1 1\n"),
        writeFile(resolve(root, "001/chord_midi.txt"), "0\t0.5\tC:maj\n0.5\t1\tG:7/5\n"),
      ]);

      await expect(
        evaluatePop909Corpus(root, { id: "pop909", sourceRevision: "fixture", forcedEvalGroups: ["001"] }),
      ).resolves.toMatchObject({
        adapter: "pop909",
        splits: { train: 0, tune: 0, eval: 2 },
        metrics: { gold: { total: 2, mapped: 2 } },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
