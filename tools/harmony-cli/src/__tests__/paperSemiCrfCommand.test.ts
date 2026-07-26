import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHarmonyCommand } from "../command";

function records(role: "train" | "tune" | "final") {
  return {
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role,
    labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
    featureVersion: "masada-bunescu-enabled-features-v1",
    labels: ["C:maj", "G:maj"],
    maxSegmentLength: 1,
    records: [
      {
        id: `${role}-fixture`,
        corpus: "synthetic",
        groupId: role,
        events: [
          {
            index: 0,
            range: {
              start: { measureIndex: 0, offsetTicks: 0 },
              end: { measureIndex: 0, offsetTicks: 1 },
            },
            startTick: 0,
            endTick: 1,
            durationTicks: 1,
            metricAccent: 1,
            notes: [],
          },
        ],
        targetSegments: [{ startEvent: 0, endEvent: 1, label: "C:maj" }],
      },
    ],
  };
}

describe("paper Semi-CRF CLI", () => {
  it("trains, checkpoints, and evaluates versioned records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-paper-semi-crf-"));
    await writeFile(join(directory, "train.json"), JSON.stringify(records("train")));
    await writeFile(join(directory, "tune.json"), JSON.stringify(records("tune")));

    const trained = await runHarmonyCommand(
      [
        "paper-semi-crf-train",
        "train.json",
        "--output",
        "model.json",
        "--checkpoint",
        "checkpoint.json",
        "--report",
        "train-report.json",
        "--max-iterations",
        "2",
        "--min-feature-count",
        "0",
        "--l2",
        "0.1",
      ],
      { cwd: directory },
    );
    const evaluated = await runHarmonyCommand(
      ["paper-semi-crf-eval", "tune.json", "--model", "model.json", "--output", "eval-report.json"],
      { cwd: directory },
    );

    expect(trained).toMatchObject({ command: "paper-semi-crf-train", iterations: 0 });
    expect(JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8"))).toMatchObject({
      schemaVersion: "paper-semi-crf-training-checkpoint-v1",
      optimizer: { iteration: 0 },
    });
    expect(evaluated).toMatchObject({
      command: "paper-semi-crf-eval",
      role: "tune",
      provenance: "fresh",
      metrics: { events: { total: 1 }, segments: { gold: 1 } },
    });
  });

  it("requires an explicit flag before reading final records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-paper-semi-crf-final-"));
    await writeFile(join(directory, "final.json"), JSON.stringify(records("final")));

    await expect(
      runHarmonyCommand(["paper-semi-crf-eval", "final.json", "--model", "missing.json", "--output", "report.json"], {
        cwd: directory,
      }),
    ).rejects.toThrow("final records require --allow-final");
  });

  it("requires an explicit train or tune role for DCML window export", async () => {
    await expect(
      runHarmonyCommand([
        "paper-semi-crf-dcml-records",
        "manifest.json",
        "--protocol",
        "protocol.json",
        "--data-root",
        "data",
        "--case",
        "mozart",
        "--split",
        "eval",
        "--output",
        "records.json",
        "--report",
        "report.json",
      ]),
    ).rejects.toThrow("paper Semi-CRF DCML records --split must be train or tune");
  });
});
