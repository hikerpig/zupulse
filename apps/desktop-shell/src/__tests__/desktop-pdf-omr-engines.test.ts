import { describe, expect, it } from "vitest";
import { synchronizePdfOmrEngine } from "../desktop-pdf-omr-engines";

describe("Desktop PDF OMR engine options", () => {
  it("replaces a cleared provider without refreshing every engine", () => {
    const engines = [{ id: "rokot", version: "1.0.0", label: "Rokot", available: true, inputKinds: ["pdf"] as const }];

    synchronizePdfOmrEngine(engines, {
      id: "rokot",
      state: "unconfigured",
      inputKinds: ["pdf"],
      hasExplicitConfiguration: false,
      fields: [],
    });

    expect(engines).toEqual([
      {
        id: "rokot",
        version: "unknown",
        label: "Rokot",
        available: false,
        inputKinds: ["pdf"],
        reason: "missing-rokot-configuration",
      },
    ]);
  });
});
