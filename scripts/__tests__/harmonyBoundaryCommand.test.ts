import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runHarmonyBoundaryCommand } from "../harmonyBoundaryCommand";

const baseReport = {
  schemaVersion: "1.0.0",
  command: "boundary-records",
  featureVersion: "boundary-evidence-v1",
  groupsSha256: "a".repeat(64),
  sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "b".repeat(64) }],
  records: [
    {
      id: "n",
      corpus: "fixture",
      groupId: "work",
      moment: { measureIndex: 0, offsetTicks: 1 },
      target: 0,
      features: [0, 0, 1, 0.08, 0.2],
    },
    {
      id: "p",
      corpus: "fixture",
      groupId: "work",
      moment: { measureIndex: 0, offsetTicks: 2 },
      target: 1,
      features: [0, 1, 0, 0.17, 1],
    },
  ],
};

describe("harmony boundary command", () => {
  it("round-trips train, tune, and evaluation assets", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "harmony-boundary-"));
    const train = resolve(root, "train.json");
    const tune = resolve(root, "tune.json");
    const rawModel = resolve(root, "raw-model.json");
    const tunedModel = resolve(root, "tuned-model.json");
    await writeFile(train, JSON.stringify({ ...baseReport, split: "train" }));
    await writeFile(tune, JSON.stringify({ ...baseReport, split: "tune" }));

    await runHarmonyBoundaryCommand(["train", rawModel, train]);
    const tuned = await runHarmonyBoundaryCommand(["tune", tunedModel, rawModel, tune]);
    const evaluated = await runHarmonyBoundaryCommand(["evaluate", tunedModel, tune]);

    expect(tuned).toMatchObject({ command: "tune-boundary-threshold", threshold: expect.any(Number) });
    expect(evaluated).toMatchObject({ precision: 1, recall: 1, f1: 1 });
    expect(JSON.parse(await readFile(tunedModel, "utf8"))).toMatchObject({ schemaVersion: "1.0.0" });
  });
});
