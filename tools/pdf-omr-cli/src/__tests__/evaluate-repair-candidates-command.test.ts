import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json";
import { compareEnginesCommand } from "../commands/compare-engines";
import { evaluateRepairCandidatesCommand } from "../commands/evaluate-repair-candidates";
import type { OmrScoreDraft } from "../schemas";

describe("evaluateRepairCandidatesCommand", () => {
  it("writes development metrics without writing a simulated Draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "repair-candidate-evaluation-"));
    const expected = draft([60, 62, 64, 65]);
    const primary = await benchmarkRun(root, "primary", "legato", draft([60, 64, 65]), expected);
    const secondary = await benchmarkRun(root, "secondary", "rokot", expected, expected);
    const comparison = join(root, "comparison");
    await compareEnginesCommand({ primaryDirectory: primary, secondaryDirectory: secondary, output: comparison });

    const result = await evaluateRepairCandidatesCommand({
      comparisonDirectory: comparison,
      primaryDirectory: primary,
      output: join(root, "evaluation"),
    });

    expect(result).toMatchObject({ command: "evaluate-repair-candidates", status: "succeeded" });
    const report = JSON.parse(await readFile(join(root, "evaluation/evaluation.json"), "utf8"));
    expect(report).toMatchObject({
      items: { total: 1, appliedCandidates: 1, improved: 1, regressed: 0, mixed: 0, unchanged: 0 },
      overall: {
        after: { jointF1: 1, validMeasureRate: 1 },
        assessment: "improved",
        nonRegressive: true,
      },
    });
    expect(report.overall.delta.jointF1).toBeGreaterThan(0);
    await expect(readFile(join(root, "evaluation/simulated-draft.json"))).rejects.toThrow();
  });
});

async function benchmarkRun(
  root: string,
  name: string,
  engineId: string,
  predictedDraft: OmrScoreDraft,
  groundTruthDraft: OmrScoreDraft,
): Promise<string> {
  const directory = join(root, name);
  await mkdir(join(directory, "items/score"), { recursive: true });
  await writeFile(
    join(directory, "report.json"),
    canonicalJson({
      schemaVersion: "1.0.0",
      metadata: {
        corpusId: "comparison-corpus",
        protocolVersion: "1.0.0",
        manifestSha256: "a".repeat(64),
        mode: "development",
        engineId,
        preprocess: "none",
      },
      items: { total: 1, succeeded: 1, failed: 0 },
    }),
  );
  await writeFile(join(directory, "items/score/predicted-draft.json"), canonicalJson(predictedDraft));
  await writeFile(join(directory, "items/score/ground-truth-draft.json"), canonicalJson(groundTruthDraft));
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
