import { describe, expect, it } from "vitest";
import { parseDcmlPiece } from "../adapters/dcml";

const measures = [
  "mc\tmn\tquarterbeats\tquarterbeats_all_endings\tduration_qb\tkeysig\ttimesig",
  "1\t1\t0\t0\t4\t0\t4/4",
  "2\t2\t\t4\t4\t0\t4/4",
].join("\n");
const notes = [
  "mc\tquarterbeats\tquarterbeats_all_endings\tduration_qb\tmc_onset\tstaff\tvoice\tgracenote\tnominal_duration\ttied\ttpc\tmidi",
  "1\t0\t0\t4\t0\t1\t1\t\t1\t\t0\t60",
  "1\t0\t0\t4\t0\t1\t2\t\t1\t\t4\t64",
  "1\t0\t0\t4\t0\t1\t3\t\t1\t\t1\t67",
  "2\t\t4\t4\t0\t1\t1\t\t1\t\t1\t67",
  "2\t\t4\t4\t0\t1\t2\t\t1\t\t5\t71",
  "2\t\t4\t4\t0\t1\t3\t\t1\t\t2\t74",
  "2\t\t4\t4\t0\t1\t4\t\t1\t\t-2\t77",
].join("\n");
const harmonies = [
  "mc\tquarterbeats\tquarterbeats_all_endings\tduration_qb\tglobalkey\tlocalkey\tlabel\tchord_type\troot\tbass_note\tchanges",
  "1\t0\t0\t4\tC\tI\tI\tM\t0\t0\t",
  "2\t\t4\t\tC\tI\tV7\tMm7\t1\t1\t",
].join("\n");

describe("parseDcmlPiece", () => {
  it("projects DCML notes and absolute expert chords into the shared model", () => {
    const piece = parseDcmlPiece({ corpus: "mozart", groupId: "K331", measures, notes, harmonies });

    expect(piece.input).toMatchObject({
      ticksPerQuarter: 480,
      measures: [
        { index: 0, durationTicks: 1_920, timeSignature: { numerator: 4, denominator: 4 }, key: "fifths:0" },
        { index: 1, durationTicks: 1_920, timeSignature: { numerator: 4, denominator: 4 }, key: "fifths:0" },
      ],
    });
    expect(piece.input.tracks[0]?.staves[0]?.notes).toHaveLength(7);
    expect(piece.gold).toMatchObject([
      {
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 0 } },
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
        family: "triad",
      },
      {
        range: { start: { measureIndex: 1, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 1_920 } },
        chord: { root: { step: "G", alter: 0 }, kind: "dominant", extension: 7, degrees: [] },
        family: "seventh",
      },
    ]);
  });

  it("records unsupported expert labels instead of guessing", () => {
    const piece = parseDcmlPiece({
      corpus: "mozart",
      groupId: "K331",
      measures,
      notes,
      harmonies: harmonies.replace("V7\tMm7", "Ger\tGer"),
    });

    expect(piece.gold[1]).toMatchObject({ unsupportedLabel: "Ger", family: "augmented-sixth" });
    expect(piece.gold[1]).not.toHaveProperty("chord");
  });

  it("separates inversion and applied/chromatic slices", () => {
    const inversion = parseDcmlPiece({
      corpus: "mozart",
      groupId: "K331",
      measures,
      notes,
      harmonies: harmonies.replace("V7\tMm7\t1\t1", "V6\tM\t1\t0"),
    });
    const applied = parseDcmlPiece({
      corpus: "mozart",
      groupId: "K331",
      measures,
      notes,
      harmonies: harmonies.replace("C\tI\tV7", "C\tV\tV7"),
    });

    expect(inversion.gold[1]?.family).toBe("inversion");
    expect(applied.gold[1]?.family).toBe("applied-chromatic");
  });

  it("accepts a sparse notes table that omits the all-empty gracenote column", () => {
    const withoutGraceColumn = notes
      .split("\n")
      .map((line) =>
        line
          .split("\t")
          .filter((_, index) => index !== 7)
          .join("\t"),
      )
      .join("\n");

    expect(() =>
      parseDcmlPiece({ corpus: "mozart", groupId: "K545", measures, notes: withoutGraceColumn, harmonies }),
    ).not.toThrow();
  });
});
