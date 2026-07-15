import { describe, expect, it } from "vitest";
import { matchesUciHarmonyLabel, parseUciHarmonyLabel } from "../uciHarmonyLabel";

describe("UCI Bach harmony labels", () => {
  it.each([
    ["C_M7", { root: { step: "C" }, kind: "dominant", extension: 7 }],
    ["C_M6", { root: { step: "C" }, kind: "major", extension: 6 }],
    ["C_M4", { root: { step: "C" }, kind: "major", degrees: [{ operation: "add", value: 4, alter: 0 }] }],
    ["C_m7", { root: { step: "C" }, kind: "minor", extension: 7 }],
    ["C#d7", { root: { step: "C", alter: 1 }, kind: "diminished", extension: 7 }],
  ])("parses %s", (label, expected) => {
    expect(parseUciHarmonyLabel(label)).toMatchObject(expected);
  });

  it("matches the annotated chord class independently of the observed bass feature", () => {
    const expected = parseUciHarmonyLabel("G_M7");
    expect(expected).not.toBeNull();
    expect(matchesUciHarmonyLabel({ ...expected!, bass: { step: "B", alter: 0 } }, expected!)).toBe(true);
  });
});
