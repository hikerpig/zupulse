import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateRealMultiSystemCase, evaluateRealMultiSystemRun } from "../benchmark/real-multisystem-evaluation";

const temporaryDirectories: string[] = [];

const caseDefinition = {
  schemaVersion: "1.0.0" as const,
  caseId: "olimpic-6007571-real-multisystem-v1",
  corpusId: "olimpic-real-multisystem-dev-v1",
  itemId: "olimpic-6007571-full-page",
  engineId: "rokot",
  source: {
    inputSha256: "f89b5ae71c7248a846c09ce3fe70924c67ad16d5a30c62ac043a733c4ccccb9d",
    groundTruthSha256: "d822ea6011aa393536f8702c57ac79679129ac8720789793b00cb6bbd2298817",
    mappingSha256: "8b88f3975aa3a25f76718504b539493a264a109f0b5a6c9779b081c9b9aaf6c1",
  },
  groundTruthPolicy: "evaluation-only" as const,
  expected: { pageCount: 4, systemCount: 15, minimumSystemCount: 2 },
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

function joiningEvidence() {
  return {
    schemaVersion: "1.0.0",
    normalizedMeasureCount: 2,
    systems: [
      {
        source: { pageIndex: 0, systemIndex: 0, cropSha256: "a".repeat(64) },
        localMeasureCount: 1,
        localMeasureNumbers: { P1: ["1"] },
        rawGlobalMeasureStart: 0,
        rawGlobalMeasureEnd: 0,
      },
      ...Array.from({ length: 14 }, (_, index) => ({
        source: {
          pageIndex: Math.min(3, Math.floor((index + 1) / 4)),
          systemIndex: (index + 1) % 4,
          cropSha256: String((index + 2) % 10).repeat(64),
        },
        localMeasureCount: index === 13 ? 1 : 0,
        localMeasureNumbers: { P1: index === 13 ? ["2"] : [] },
        rawGlobalMeasureStart: index === 13 ? 1 : 1,
        rawGlobalMeasureEnd: index === 13 ? 1 : 1,
      })),
    ],
    rawMeasureBoundaries: [
      {
        globalMeasureIndex: 0,
        source: { pageIndex: 0, systemIndex: 0, cropSha256: "a".repeat(64) },
        localMeasureIndex: 0,
      },
      {
        globalMeasureIndex: 1,
        source: { pageIndex: 3, systemIndex: 2, cropSha256: "5".repeat(64) },
        localMeasureIndex: 0,
      },
    ],
    normalizedMeasureBoundaries: [
      {
        globalMeasureIndex: 0,
        source: { pageIndex: 0, systemIndex: 0, cropSha256: "a".repeat(64) },
      },
      {
        globalMeasureIndex: 1,
        source: { pageIndex: 3, systemIndex: 2, cropSha256: "5".repeat(64) },
      },
    ],
  };
}

describe("real multi-system evaluation", () => {
  it("evaluates only a matching real-engine item with complete joining and MusicXML evidence", () => {
    const result = evaluateRealMultiSystemCase(caseDefinition, {
      corpusId: caseDefinition.corpusId,
      engineId: caseDefinition.engineId,
      item: {
        itemId: caseDefinition.itemId,
        status: "succeeded",
        symbolic: { jointF1: 0.25, validMeasureRate: 0.1 },
        musicXml: { parse: true, structural: true },
      },
      joiningEvidence: joiningEvidence(),
    });

    expect(result).toMatchObject({
      status: "EVALUATED",
      observed: {
        pageCount: 4,
        systemCount: 15,
        normalizedMeasureCount: 2,
        normalizedSourceCoverage: 1,
      },
      quality: { jointF1: 0.25, validMeasureRate: 0.1 },
    });
  });

  it("keeps an engine failure NOT_EVALUATED instead of substituting another artifact", () => {
    const result = evaluateRealMultiSystemCase(caseDefinition, {
      corpusId: caseDefinition.corpusId,
      engineId: caseDefinition.engineId,
      item: {
        itemId: caseDefinition.itemId,
        status: "failed",
        error: { code: "ENGINE_OUTPUT_INVALID", reason: "ambiguous-system-segmentation" },
      },
    });

    expect(result).toEqual({
      schemaVersion: "1.0.0",
      caseId: caseDefinition.caseId,
      itemId: caseDefinition.itemId,
      status: "NOT_EVALUATED",
      reason: "engine-item-failed",
      error: { code: "ENGINE_OUTPUT_INVALID", reason: "ambiguous-system-segmentation" },
    });
  });

  it("fails closed when a successful item has no valid multi-system joining artifact", () => {
    const evidence = joiningEvidence();
    evidence.systems[1]!.source = evidence.systems[0]!.source;

    const result = evaluateRealMultiSystemCase(caseDefinition, {
      corpusId: caseDefinition.corpusId,
      engineId: caseDefinition.engineId,
      item: {
        itemId: caseDefinition.itemId,
        status: "succeeded",
        symbolic: { jointF1: 0.25, validMeasureRate: 0.1 },
        musicXml: { parse: true, structural: true },
      },
      joiningEvidence: evidence,
    });

    expect(result).toMatchObject({ status: "NOT_EVALUATED", reason: "invalid-joining-artifact" });
  });

  it("reads the exact engine item failure from a benchmark run", async () => {
    const runDirectory = await mkdtemp(join(tmpdir(), "real-multisystem-run-"));
    temporaryDirectories.push(runDirectory);
    const itemDirectory = join(runDirectory, "items", caseDefinition.itemId);
    await mkdir(itemDirectory, { recursive: true });
    await writeFile(
      join(runDirectory, "report.json"),
      JSON.stringify({ metadata: { corpusId: caseDefinition.corpusId, engineId: caseDefinition.engineId } }),
    );
    await writeFile(
      join(itemDirectory, "error.json"),
      JSON.stringify({
        itemId: caseDefinition.itemId,
        status: "failed",
        error: {
          code: "ENGINE_OUTPUT_INVALID",
          context: { reason: "ambiguous-system-segmentation", stage: "staff-system-topology", pageIndex: 0 },
        },
      }),
    );

    await expect(evaluateRealMultiSystemRun(caseDefinition, runDirectory)).resolves.toMatchObject({
      status: "NOT_EVALUATED",
      reason: "engine-item-failed",
      error: {
        code: "ENGINE_OUTPUT_INVALID",
        reason: "ambiguous-system-segmentation",
        stage: "staff-system-topology",
        pageIndex: 0,
      },
    });
  });
});
