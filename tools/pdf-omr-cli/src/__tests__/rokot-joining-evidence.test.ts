import { describe, expect, it } from "vitest";
import { buildRokotJoiningEvidence } from "../benchmark/rokot-joining-evidence";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

const abc = `%%rokot-abc 0.1
X:1
M:4/4
L:1/4
K:C
V:1
[V:1] C4 |
`;

function system(systemIndex: number, measureNumber: string) {
  return {
    pageIndex: 0,
    systemIndex,
    source: {
      staffLayout: "single-staff" as const,
      staffCount: 1 as const,
      pixelBbox: { x: 0, y: 0, width: 100, height: 100 },
      pdfPointBbox: { x: 0, y: 0, width: 10, height: 10 },
      cropSha256: "a".repeat(64),
    },
    abcUtf8: abc,
    musicXmlUtf8: `<score-partwise><part id="P1"><measure number="${measureNumber}" /></part></score-partwise>`,
  };
}

describe("Rokot joining evidence", () => {
  it("records ordered systems and global measure boundaries without re-running the engine", () => {
    const evidence = buildRokotJoiningEvidence(
      { schemaVersion: "1.0.0", systems: [system(0, "1"), system(1, "2")] },
      musicXmlReadyDraft(),
    );

    expect(evidence.normalizedMeasureCount).toBe(2);
    expect(evidence.systems.map((item) => [item.source.systemIndex, item.rawGlobalMeasureStart])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(evidence.rawMeasureBoundaries.map((item) => item.globalMeasureIndex)).toEqual([0, 1]);
    expect(evidence.normalizedMeasureBoundaries.map((item) => item.globalMeasureIndex)).toEqual([0, 1]);
  });
});
