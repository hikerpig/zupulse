import { describe, expect, it } from "vitest";
import { alignExact } from "../benchmark/symbolic-alignment";

describe("symbolic exact alignment", () => {
  it("matches chord notes independently and preserves duplicate cardinality", () => {
    const predicted = [
      { pitch: 60, onset: 0 },
      { pitch: 64, onset: 0 },
      { pitch: 60, onset: 0 },
    ];
    const expected = [
      { pitch: 64, onset: 0 },
      { pitch: 60, onset: 0 },
    ];

    const alignment = alignExact(predicted, expected, (event) => `${event.pitch}:${event.onset}`);

    expect(alignment.matches).toHaveLength(2);
    expect(alignment.unmatchedPredicted).toHaveLength(1);
    expect(alignment.unmatchedExpected).toEqual([]);
  });

  it("does not align rests with notes sharing the same timing", () => {
    const predicted = [{ type: "rest", onset: "0/1" }];
    const expected = [{ type: "note", onset: "0/1" }];

    const alignment = alignExact(predicted, expected, (event) => `${event.type}:${event.onset}`);

    expect(alignment.matches).toEqual([]);
    expect(alignment.unmatchedPredicted).toEqual([0]);
    expect(alignment.unmatchedExpected).toEqual([0]);
  });
});
