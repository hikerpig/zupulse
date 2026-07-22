import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dcmlGroupId, evaluateDcmlCorpus } from "../adapters/dcmlEvaluation";
import { runHarmonyCommand } from "../command";
import { evaluateHarmonyManifest } from "../evaluateManifest";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("evaluateDcmlCorpus", () => {
  it("groups sonata movements together and can freeze a whole corpus as one work", () => {
    expect(dcmlGroupId("01-3", "prefix-before-hyphen", "beethoven")).toBe("01");
    expect(dcmlGroupId("n03", "corpus", "schumann-kinderszenen")).toBe("schumann-kinderszenen");
  });

  it("evaluates a work-level holdout and reports canonical mapping metrics", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "zupulse-dcml-"));
    directories.push(root);
    await createMiniDcmlCorpus(root);

    const result = await evaluateDcmlCorpus(root, {
      id: "mozart-pilot",
      include: ["K331-3"],
      forcedEvalGroups: ["K331"],
    });

    expect(result).toMatchObject({
      id: "mozart-pilot",
      kind: "accuracy-corpus",
      adapter: "dcml",
      status: "passed",
      reportSplit: "eval",
      splits: { train: 0, tune: 0, eval: 2 },
      metrics: { gold: { total: 2, mapped: 2, unsupported: 0 }, mappingCoverage: 1 },
    });
    expect(result.metrics.diagnostics).toMatchObject({
      intervalOverlap: {
        overlap: { mappedDurationTicks: expect.any(Number) },
        boundaries: { expected: 1, predicted: expect.any(Number) },
      },
    });

    const tune = await evaluateDcmlCorpus(root, {
      id: "mozart-pilot",
      include: ["K331-3"],
      forcedEvalGroups: ["K331"],
      reportSplit: "tune",
    });
    expect(tune).toMatchObject({ reportSplit: "tune", metrics: { gold: { total: 0, mapped: 0, unsupported: 0 } } });
  });

  it("evaluates a checksummed v2 manifest through the CLI evaluator", async () => {
    const dataRoot = await mkdtemp(resolve(tmpdir(), "zupulse-datasets-"));
    directories.push(dataRoot);
    await createMiniDcmlCorpus(resolve(dataRoot, "mozart"));
    const archive = new Uint8Array([1, 2, 3]);
    await writeFile(resolve(dataRoot, "mozart.zip"), archive);
    const manifestPath = resolve(dataRoot, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: "2.0.0",
        id: "dataset-fixture",
        cases: [
          {
            id: "mozart-pilot",
            adapterVersion: "1.0.0",
            kind: "accuracy-corpus",
            adapter: "dcml",
            datasetPath: "mozart",
            archivePath: "mozart.zip",
            source: {
              url: "https://example.test/mozart.zip",
              revision: "fixture",
              license: "CC-BY-NC-SA-4.0",
              sha256: createHash("sha256").update(archive).digest("hex"),
            },
            forcedEvalGroups: ["K331"],
            include: ["K331-3"],
          },
        ],
      }),
    );

    const report = await evaluateHarmonyManifest(manifestPath, { dataRoot, caseId: "mozart-pilot" });
    expect(report).toMatchObject({
      schemaVersion: "2.4.0",
      command: "eval",
      summary: { passed: 1, failed: 0 },
    });
    if (report.schemaVersion !== "2.4.0" || report.cases[0]?.kind !== "accuracy-corpus") {
      throw new Error("expected accuracy report");
    }
    const reportPath = resolve(dataRoot, "report.json");
    const baselinePath = resolve(dataRoot, "baseline.json");
    const {
      facets: _facets,
      slices: _slices,
      diagnostics: _diagnostics,
      unsupportedLabelRate: _unsupportedLabelRate,
      ...baselineMetrics
    } = report.cases[0].metrics;
    await writeFile(reportPath, JSON.stringify(report));
    await writeFile(
      baselinePath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        sourceManifest: "dataset-fixture",
        datasetRevision: "fixture",
        algorithmVersion: "fixture",
        tolerance: 0.005,
        cases: {
          "mozart-pilot": { splits: report.cases[0].splits, ...baselineMetrics },
        },
      }),
    );
    await expect(runHarmonyCommand(["compare", baselinePath, reportPath])).resolves.toMatchObject({
      command: "compare",
      summary: { passed: 1, failed: 0 },
    });
  });
});

async function createMiniDcmlCorpus(root: string): Promise<void> {
  await Promise.all(["measures", "notes", "harmonies"].map((name) => mkdir(resolve(root, name), { recursive: true })));
  await writeFile(
    resolve(root, "measures/K331-3.measures.tsv"),
    ["mc\tmn\tquarterbeats\tduration_qb\tkeysig\ttimesig", "1\t1\t0\t4\t0\t4/4", "2\t2\t4\t4\t0\t4/4"].join("\n"),
  );
  await writeFile(
    resolve(root, "notes/K331-3.notes.tsv"),
    [
      "mc\tquarterbeats\tduration_qb\tmc_onset\tstaff\tvoice\tgracenote\tnominal_duration\ttied\ttpc\tmidi",
      "1\t0\t4\t0\t1\t1\t\t1\t\t0\t60",
      "1\t0\t4\t0\t1\t2\t\t1\t\t4\t64",
      "1\t0\t4\t0\t1\t3\t\t1\t\t1\t67",
      "2\t4\t4\t0\t1\t1\t\t1\t\t1\t67",
      "2\t4\t4\t0\t1\t2\t\t1\t\t5\t71",
      "2\t4\t4\t0\t1\t3\t\t1\t\t2\t74",
      "2\t4\t4\t0\t1\t4\t\t1\t\t-2\t77",
    ].join("\n"),
  );
  await writeFile(
    resolve(root, "harmonies/K331-3.harmonies.tsv"),
    [
      "mc\tquarterbeats\tduration_qb\tglobalkey\tlocalkey\tlabel\tchord_type\troot\tbass_note\tchanges",
      "1\t0\t4\tC\tI\tI\tM\t0\t0\t",
      "2\t4\t4\tC\tI\tV7\tMm7\t1\t1\t",
    ].join("\n"),
  );
}
