import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const selectionPath = fileURLToPath(
  new URL("../../corpus/public-pianoform-v1/olimpic-selection.json", import.meta.url),
);
const protocolPath = fileURLToPath(
  new URL("../../corpus/public-pianoform-v1/repair-selector-protocol.json", import.meta.url),
);

describe("repair selector protocol", () => {
  it("locks a work-disjoint development split and a GT-free validation gate", async () => {
    const selectionBytes = await readFile(selectionPath);
    const selection = JSON.parse(selectionBytes.toString("utf8"));
    const protocol = JSON.parse(await readFile(protocolPath, "utf8"));
    const standardWorks = new Set(
      selection.profiles["standard-development"].items.map((item: { workId: string }) => item.workId),
    );
    const calibration = new Set<string>(protocol.partition.calibrationWorks);
    const validation = new Set<string>(protocol.partition.validationWorks);

    expect(protocol.input.selectionSha256).toBe(createHash("sha256").update(selectionBytes).digest("hex"));
    expect(calibration.size).toBe(18);
    expect(validation.size).toBe(18);
    expect([...calibration].every((workId) => !validation.has(workId))).toBe(true);
    expect(new Set([...calibration, ...validation])).toEqual(standardWorks);
    const rankedWorks = [...standardWorks].sort((left, right) =>
      createHash("sha256").update(left).digest("hex").localeCompare(createHash("sha256").update(right).digest("hex")),
    );
    expect(protocol.partition.calibrationWorks).toEqual(rankedWorks.slice(0, 18));
    expect(protocol.partition.validationWorks).toEqual(rankedWorks.slice(18));
    expect(protocol.selector.forbiddenFeatures).toContain("groundTruthDraft");
    expect(protocol.selector.forbiddenFeatures).toContain("oracleRecommended");
    expect(protocol.gate).toMatchObject({
      minimumSelectedCandidates: 35,
      maximumRegressedCandidates: 0,
      minimumWilsonLowerBound: 0.9,
      combinedNonRegressive: true,
      automaticApplicationAllowed: false,
    });
  });
});
