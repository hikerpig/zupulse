import { describe, expect, it } from "vitest";
import { formatChordSymbol } from "../formatter";

describe("formatChordSymbol", () => {
  it("formats kind, extension, alterations, and slash bass", () => {
    expect(
      formatChordSymbol({
        root: { step: "C", alter: 0 },
        kind: "dominant",
        extension: 13,
        degrees: [
          { operation: "alter", value: 9, alter: -1 },
          { operation: "alter", value: 13, alter: -1 },
        ],
        bass: { step: "E", alter: 0 },
      }),
    ).toBe("C13(b9,b13)/E");
  });

  it("uses stable spellings for enharmonic roots and suspended chords", () => {
    expect(
      formatChordSymbol({
        root: { step: "D", alter: -1 },
        kind: "suspended-fourth",
        degrees: [],
      }),
    ).toBe("Dbsus4");
  });
});
