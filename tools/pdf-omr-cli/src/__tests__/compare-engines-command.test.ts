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
      items: { total: 1, agreements: 0, disagreements: 1 },
      comparisons: [
        {
          itemId: "score",
          proposals: [{ kind: "measure-missing-in-primary", secondaryMeasureIndex: 1 }],
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
