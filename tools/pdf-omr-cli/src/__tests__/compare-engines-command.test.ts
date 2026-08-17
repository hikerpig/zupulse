import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json";
import { compareEnginesCommand } from "../commands/compare-engines";
import type { OmrScoreDraft } from "../schemas";

describe("compareEnginesCommand", () => {
  it("writes a canonical report without modifying either benchmark run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "engine-comparison-command-"));
    const primary = await benchmarkRun(directory, "primary", "legato", draft([60, 64, 65]));
    const secondary = await benchmarkRun(directory, "secondary", "rokot", draft([60, 62, 64, 65]));
    const output = join(directory, "comparison");

    const result = await compareEnginesCommand({ primaryDirectory: primary, secondaryDirectory: secondary, output });

    expect(result).toMatchObject({ command: "compare-engines", status: "succeeded" });
    const comparison = JSON.parse(await readFile(join(output, "comparison.json"), "utf8"));
    expect(comparison).toMatchObject({
      identity: { corpusId: "comparison-corpus", mode: "development" },
      primary: { engineId: "legato" },
      secondary: { engineId: "rokot" },
      items: {
        attempted: 1,
        primarySucceeded: 1,
        secondarySucceeded: 1,
        comparable: 1,
        agreements: 0,
        disagreements: 1,
        repairCandidates: 1,
      },
      comparisons: [
        {
          itemId: "score",
          proposals: [
            {
              kind: "measure-missing-in-primary",
              secondaryMeasureIndex: 1,
              repairCandidate: {
                operation: "insert",
                targetMeasureIndex: 1,
                sourceMeasureIndex: 1,
                reviewRequired: true,
                autoApplicable: false,
              },
            },
          ],
        },
      ],
    });
    expect(await readFile(join(primary, "items/score/predicted-draft.json"), "utf8")).toBe(
      canonicalJson(draft([60, 64, 65])),
    );
    expect(await readFile(join(secondary, "items/score/predicted-draft.json"), "utf8")).toBe(
      canonicalJson(draft([60, 62, 64, 65])),
    );
  });

  it("compares the successful intersection and preserves attempted denominators", async () => {
    const directory = await mkdtemp(join(tmpdir(), "engine-comparison-partial-"));
    const primary = await benchmarkRun(directory, "primary", "legato", draft([60]));
    const secondary = await benchmarkRun(directory, "secondary", "rokot", draft([60]));
    await mkdir(join(primary, "items/failed"), { recursive: true });
    await mkdir(join(secondary, "items/failed"), { recursive: true });
    await writeFile(join(secondary, "items/failed/predicted-draft.json"), canonicalJson(draft([62])));
    for (const [run, succeeded, failed] of [
      [primary, 1, 1],
      [secondary, 2, 0],
    ] as const) {
      const report = JSON.parse(await readFile(join(run, "report.json"), "utf8"));
      report.items = { total: 2, succeeded, failed };
      report.failures = failed === 0 ? [] : [{ itemId: "failed", category: "test", code: "ENGINE_UNAVAILABLE" }];
      await writeFile(join(run, "report.json"), canonicalJson(report));
    }

    await compareEnginesCommand({
      primaryDirectory: primary,
      secondaryDirectory: secondary,
      output: join(directory, "comparison"),
    });

    const report = JSON.parse(await readFile(join(directory, "comparison/comparison.json"), "utf8"));
    expect(report.items).toMatchObject({
      attempted: 2,
      primarySucceeded: 1,
      secondarySucceeded: 2,
      comparable: 1,
    });
    expect(report.comparisons.map((comparison: { itemId: string }) => comparison.itemId)).toEqual(["score"]);
  });

  it("rejects benchmark runs from different manifests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "engine-comparison-command-"));
    const primary = await benchmarkRun(directory, "primary", "legato", draft([60]));
    const secondary = await benchmarkRun(directory, "secondary", "rokot", draft([60]), "b".repeat(64));

    await expect(
      compareEnginesCommand({
        primaryDirectory: primary,
        secondaryDirectory: secondary,
        output: join(directory, "out"),
      }),
    ).rejects.toMatchObject({
      code: "BENCHMARK_EVALUATION_LIMITATION",
      context: { reason: "incompatible-benchmark-runs" },
    });
  });
});

async function benchmarkRun(
  root: string,
  name: string,
  engineId: string,
  predictedDraft: OmrScoreDraft,
  manifestSha256 = "a".repeat(64),
): Promise<string> {
  const directory = join(root, name);
  await mkdir(join(directory, "items/score"), { recursive: true });
  const report = {
    schemaVersion: "1.0.0",
    metadata: {
      corpusId: "comparison-corpus",
      protocolVersion: "1.0.0",
      manifestSha256,
      mode: "development",
      engineId,
      preprocess: "none",
    },
    items: { total: 1, succeeded: 1, failed: 0 },
  };
  await writeFile(join(directory, "report.json"), canonicalJson(report));
  await writeFile(join(directory, "items/score/predicted-draft.json"), canonicalJson(predictedDraft));
  return directory;
}

function draft(pitches: readonly number[]): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Part",
        staves: [
          {
            index: 0,
            measures: pitches.map((soundingMidi, index) => ({
              index,
              duration: { numerator: 1, denominator: 1 },
              voices: [
                {
                  index: 1,
                  events: [
                    {
                      type: "note" as const,
                      id: `m${index}-n1`,
                      onset: { numerator: 0, denominator: 1 },
                      duration: { numerator: 1, denominator: 1 },
                      soundingMidi,
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ],
    diagnostics: [],
  };
}
