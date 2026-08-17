import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Bytes } from "../canonical-json";
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
      coverage: { attempted: 1, comparable: 1, itemsWithCandidates: 1, candidates: 1 },
      items: { comparable: 1, appliedCandidates: 1, improved: 1, regressed: 0, mixed: 0, unchanged: 0 },
      operations: {
        insert: { total: 1, improved: 1, regressed: 0, mixed: 0, unchanged: 0 },
        replace: { total: 0, improved: 0, regressed: 0, mixed: 0, unchanged: 0 },
        delete: { total: 0, improved: 0, regressed: 0, mixed: 0, unchanged: 0 },
      },
      overall: {
        after: { jointF1: 1, validMeasureRate: 1 },
        assessment: "improved",
        nonRegressive: true,
      },
    });
    expect(report.overall.delta.jointF1).toBeGreaterThan(0);
    await expect(readFile(join(root, "evaluation/simulated-draft.json"))).rejects.toThrow();
  });

  it("recommends only independently improved non-regressive candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "repair-candidate-precision-"));
    const expected = draft([62, 64]);
    const primary = await benchmarkRun(root, "primary", "legato", draft([60, 64]), expected);
    const secondary = await benchmarkRun(root, "secondary", "rokot", draft([62, 65]), expected);
    const comparison = join(root, "comparison");
    await compareEnginesCommand({ primaryDirectory: primary, secondaryDirectory: secondary, output: comparison });

    await evaluateRepairCandidatesCommand({
      comparisonDirectory: comparison,
      primaryDirectory: primary,
      output: join(root, "evaluation"),
    });

    const report = JSON.parse(await readFile(join(root, "evaluation/evaluation.json"), "utf8"));
    expect(report.candidates).toMatchObject({
      total: 2,
      oracleRecommended: 1,
      improved: 1,
      regressed: 1,
      mixed: 0,
      unchanged: 0,
    });
    expect(report.candidateEvaluations).toHaveLength(2);
    expect(
      report.candidateEvaluations.map((evaluation: { oracleRecommended: boolean }) => evaluation.oracleRecommended),
    ).toEqual([true, false]);
    expect(report.candidateEvaluations[0].candidateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.oracleRecommendedSet).toMatchObject({
      appliedCandidates: 1,
      assessment: "improved",
      nonRegressive: true,
    });
    expect(report.oracleRecommendedSet.delta.pitchF1).toBeGreaterThan(0);
  });

  it("rejects individually beneficial candidates when their combined result regresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "repair-candidate-combination-"));
    const expected = draft([60, 62]);
    const primary = await benchmarkRun(root, "primary", "legato", draft([60]), expected);
    const secondary = await benchmarkRun(root, "secondary", "rokot", expected, expected);
    const comparison = join(root, "comparison");
    await compareEnginesCommand({ primaryDirectory: primary, secondaryDirectory: secondary, output: comparison });

    const comparisonPath = join(comparison, "comparison.json");
    const comparisonReport = JSON.parse(await readFile(comparisonPath, "utf8"));
    comparisonReport.items = {
      ...comparisonReport.items,
      agreements: 0,
      disagreements: 1,
      repairCandidates: 4,
    };
    comparisonReport.comparisons = [
      {
        itemId: "score",
        schemaVersion: "1.0.0",
        topologyMode: "strict",
        agreement: false,
        alignmentAmbiguous: false,
        primaryMeasureCount: 1,
        secondaryMeasureCount: 5,
        alignedMeasureCount: 1,
        proposals: Array.from({ length: 4 }, (_, index) => duplicateInsertProposal(index)),
      },
    ];
    await writeFile(comparisonPath, canonicalJson(comparisonReport));

    await evaluateRepairCandidatesCommand({
      comparisonDirectory: comparison,
      primaryDirectory: primary,
      output: join(root, "evaluation"),
    });

    const report = JSON.parse(await readFile(join(root, "evaluation/evaluation.json"), "utf8"));
    expect(report.candidates.oracleRecommended).toBe(0);
    expect(
      report.candidateEvaluations.map((evaluation: { oracleRecommended: boolean }) => evaluation.oracleRecommended),
    ).toEqual([false, false, false, false]);
    expect(report.oracleRecommendedSet).toMatchObject({
      appliedCandidates: 0,
      assessment: "unchanged",
      nonRegressive: true,
    });
    expect(report.oracleRecommendedSet.after).toEqual(report.oracleRecommendedSet.before);
  });
});

function duplicateInsertProposal(index: number) {
  const sourceFingerprint = `${index + 1}`.repeat(64);
  const facts = {
    operation: "insert" as const,
    targetMeasureIndex: 1,
    sourceMeasureIndex: index + 1,
    sourceFingerprint,
    measure: {
      staves: [
        {
          staffIndex: 0,
          duration: { numerator: 1, denominator: 1 },
          voices: [
            {
              index: 1,
              events: [
                {
                  type: "note" as const,
                  onset: { numerator: 0, denominator: 1 },
                  duration: { numerator: 1, denominator: 1 },
                  soundingMidi: 62,
                },
              ],
            },
          ],
        },
      ],
    },
    reviewRequired: true as const,
    autoApplicable: false as const,
  };
  return {
    kind: "measure-missing-in-primary" as const,
    primaryMeasureIndex: null,
    secondaryMeasureIndex: index + 1,
    secondaryFingerprint: sourceFingerprint,
    repairCandidate: {
      ...facts,
      candidateSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(facts))),
    },
    autoApplicable: false as const,
  };
}

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
