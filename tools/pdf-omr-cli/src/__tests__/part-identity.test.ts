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
});
