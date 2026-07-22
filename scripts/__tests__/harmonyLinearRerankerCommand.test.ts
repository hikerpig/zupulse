import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linearHarmonyRerankerModelSchema } from "../../packages/web-core/src";
import { runLinearHarmonyRerankerCommand } from "../harmonyLinearRerankerCommand";

const chord = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] };

function report(split: "train" | "tune") {
  return {
    schemaVersion: "1.0.0",
    command: "ranking-records",
    split,
    featureVersion: "relative-pc-presence-v1",
    groupsSha256: "a".repeat(64),
    sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "b".repeat(64) }],
    records: [
      {
        id: `fixture:${split}:0:0`,
        corpus: "fixture",
        groupId: split,
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 480 } },
        weight: 480,
        outcome: "oracle-hit",
        primaryIndex: 0,
        targetIndex: 1,
        candidates: [
          { chord, features: Array(37).fill(0), ruleLocalScore: 2, ruleSequenceScore: 2 },
          { chord, features: [1, ...Array(36).fill(0)], ruleLocalScore: 1, ruleSequenceScore: 1 },
        ],
      },
    ],
  };
}

describe("linear harmony reranker command", () => {
  it("writes a model and evaluates it from versioned report files", async () => {
    const root = await mkdtemp(join(tmpdir(), "harmony-linear-"));
    const trainPath = join(root, "train.json");
    const tunePath = join(root, "tune.json");
    const modelPath = join(root, "model.json");
    await writeFile(trainPath, JSON.stringify(report("train")));
    await writeFile(tunePath, JSON.stringify(report("tune")));

    expect(await runLinearHarmonyRerankerCommand(["train", modelPath, trainPath])).toMatchObject({
      command: "train-linear-reranker",
      output: modelPath,
      reports: 1,
    });
    expect(linearHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")))).toBeDefined();
    expect(await runLinearHarmonyRerankerCommand(["evaluate", modelPath, tunePath])).toMatchObject({
      command: "evaluate-linear-reranker",
      aggregate: { baselineTop1: 0, modelTop1: 1 },
    });
  });
});
