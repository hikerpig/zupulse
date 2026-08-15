import { describe, expect, it } from "vitest";
import { alignDraftParts } from "../benchmark/part-identity";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

describe("engine-neutral part identity", () => {
  it("maps a prediction by structural role instead of engine-specific part IDs", () => {
    const expected = musicXmlReadyDraft();
    const predicted = structuredClone(expected);
    predicted.parts[0]!.id = "piano";
    predicted.parts[0]!.name = "Piano";

    const aligned = alignDraftParts(predicted, expected);

    expect(aligned.mapping).toEqual([{ predictedId: "piano", expectedId: "P1" }]);
    expect(aligned.draft.parts[0]!.id).toBe("P1");
  });

  it("fails closed when structural roles are ambiguous", () => {
    const expected = musicXmlReadyDraft();
    const second = structuredClone(expected.parts[0]!);
    second.id = "P2";
    second.name = "Piano & Keys";
    expected.parts.push(second);
    const predicted = structuredClone(expected);
    predicted.parts[0]!.id = "engine-a";
    predicted.parts[1]!.id = "engine-b";

    expect(() => alignDraftParts(predicted, expected)).toThrowError(
      expect.objectContaining({ code: "BENCHMARK_EVALUATION_LIMITATION" }),
    );
  });

  it("aligns ordered single-staff piano parts to one grand-staff ground-truth part", () => {
    const expected = musicXmlReadyDraft();
    const lowerStaff = structuredClone(expected.parts[0]!.staves[0]!);
    lowerStaff.index = 2;
    expected.parts[0]!.staves.push(lowerStaff);
    const predicted = structuredClone(expected);
    predicted.parts = expected.parts[0]!.staves.map((staff, index) => ({
      id: `engine-${index + 1}`,
      name: `Staff ${index + 1}`,
      staves: [{ ...structuredClone(staff), index: 1 }],
    }));

    const aligned = alignDraftParts(predicted, expected);

    expect(aligned.mapping).toEqual([
      { predictedId: "engine-1", expectedId: "P1" },
      { predictedId: "engine-2", expectedId: "P1" },
    ]);
    expect(aligned.draft.parts.map((part) => part.id)).toEqual(["P1", "P1"]);
    expect(aligned.draft.parts.map((part) => part.staves[0]!.index)).toEqual(
      expected.parts[0]!.staves.map((staff) => staff.index),
    );
  });
});
