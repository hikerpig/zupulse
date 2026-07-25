import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { runHarmonyCommand } from "../command";

describe("harmony CLI inspect command", () => {
  const score = fileURLToPath(new URL("../../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));

  it("returns a versioned envelope for model view", async () => {
    const report = await runHarmonyCommand(["inspect", score, "--view", "model"]);

    expect(report).toMatchObject({
      schemaVersion: "1.0.0",
      command: "inspect",
      source: { name: "simple.mxl", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
      model: { schemaVersion: "1.0.0" },
    });
    expect(report).not.toHaveProperty("result");
  });

  it("keeps the previous positional command compatible", async () => {
    const report = await runHarmonyCommand([score, "--view", "result"]);

    expect(report).toMatchObject({ schemaVersion: "1.0.0", command: "inspect", result: expect.any(Array) });
    expect(report).not.toHaveProperty("model");
  });

  it("accepts pnpm's separator and resolves paths from the invoking workspace", async () => {
    const root = dirname(fileURLToPath(new URL("../../../../package.json", import.meta.url)));
    const report = await runHarmonyCommand(
      ["--", "inspect", "test-fixtures/musicxml/generated/simple.mxl", "--view", "model"],
      { cwd: root },
    );

    expect(report.source.name).toBe("simple.mxl");
  });

  it("rejects an invalid dataset report split before reading the manifest", async () => {
    await expect(runHarmonyCommand(["eval", "missing.json", "--split", "invalid"])).rejects.toThrow(
      "--split must be train, tune, or eval",
    );
    await expect(runHarmonyCommand(["eval", "missing.json", "--split"])).rejects.toThrow(
      "--split must be train, tune, or eval",
    );
  });

  it("rejects an invalid decision threshold before reading the manifest", async () => {
    await expect(runHarmonyCommand(["eval", "missing.json", "--decision-threshold", "invalid"])).rejects.toThrow(
      "--decision-threshold must be between 0 and 1",
    );
    await expect(runHarmonyCommand(["eval", "missing.json", "--decision-threshold", "1.1"])).rejects.toThrow(
      "--decision-threshold must be between 0 and 1",
    );
  });

  it("rejects an invalid boundary policy before reading the manifest", async () => {
    await expect(runHarmonyCommand(["eval", "missing.json", "--boundary-policy", "notes"])).rejects.toThrow(
      "--boundary-policy must be dense-note-events, metric-beats, metric-half-beats, metric-strong-onsets, or learned-evidence",
    );
  });

  it("requires an explicit model for learned boundary evaluation", async () => {
    await expect(runHarmonyCommand(["eval", "missing.json", "--boundary-policy", "learned-evidence"])).rejects.toThrow(
      "--boundary-model is required for learned-evidence policy",
    );
  });

  it("requires explicit protocol, data root, case, and output for ranking records", async () => {
    await expect(runHarmonyCommand(["ranking-records", "manifest.json"])).rejects.toThrow(
      "usage: harmony:cli ranking-records",
    );
  });

  it("requires explicit inputs and split for boundary records", async () => {
    await expect(runHarmonyCommand(["boundary-records", "manifest.json"])).rejects.toThrow(
      "usage: harmony:cli boundary-records",
    );
    await expect(
      runHarmonyCommand([
        "boundary-records",
        "manifest.json",
        "--protocol",
        "protocol.json",
        "--data-root",
        "data",
        "--case",
        "mozart",
        "--output",
        "records.json",
        "--split",
        "eval",
      ]),
    ).rejects.toThrow("boundary records --split must be train or tune");
  });

  it("validates structured oracle inputs before reading the manifest", async () => {
    await expect(runHarmonyCommand(["structured-oracle", "manifest.json"])).rejects.toThrow(
      "usage: harmony:cli structured-oracle",
    );
    const required = [
      "structured-oracle",
      "manifest.json",
      "--protocol",
      "protocol.json",
      "--data-root",
      "data",
      "--case",
      "mozart",
      "--output",
      "oracle.json",
    ];
    await expect(runHarmonyCommand([...required, "--split", "eval"])).rejects.toThrow(
      "structured oracle --split must be train or tune",
    );
    await expect(runHarmonyCommand([...required, "--max-span", "0"])).rejects.toThrow(
      "--max-span must be a positive integer",
    );
    await expect(runHarmonyCommand([...required, "--max-span", "16", "--max-quarter-notes", "8"])).rejects.toThrow(
      "--max-span and --max-quarter-notes are mutually exclusive",
    );
    await expect(runHarmonyCommand([...required, "--max-quarter-notes", "0"])).rejects.toThrow(
      "--max-quarter-notes must be positive",
    );
    await expect(runHarmonyCommand([...required, "--top-k", "9"])).rejects.toThrow(
      "--top-k must be an integer from 1 to 8",
    );
  });

  it("validates structured records inputs before reading the manifest", async () => {
    await expect(runHarmonyCommand(["structured-records", "manifest.json"])).rejects.toThrow(
      "usage: harmony:cli structured-records",
    );
    const required = [
      "structured-records",
      "manifest.json",
      "--protocol",
      "protocol.json",
      "--data-root",
      "data",
      "--case",
      "mozart",
      "--output",
      "records.json",
    ];
    await expect(runHarmonyCommand([...required, "--split", "eval"])).rejects.toThrow(
      "structured records --split must be train or tune",
    );
    await expect(runHarmonyCommand([...required, "--max-groups", "0"])).rejects.toThrow(
      "--max-groups must be a positive integer",
    );
  });

  it("validates structured trainer inputs before reading records", async () => {
    await expect(runHarmonyCommand(["train-structured", "records.json"])).rejects.toThrow(
      "usage: harmony:cli train-structured",
    );
    await expect(
      runHarmonyCommand(["train-structured", "records.json", "--output", "model.json", "--epochs", "-1"]),
    ).rejects.toThrow("--epochs must be a nonnegative integer");
    await expect(
      runHarmonyCommand(["train-structured", "records.json", "--output", "model.json", "--learning-rate", "-1"]),
    ).rejects.toThrow("--learning-rate must be nonnegative");
  });

  it("rejects invalid ranking-record splits before reading files", async () => {
    await expect(
      runHarmonyCommand([
        "ranking-records",
        "manifest.json",
        "--protocol",
        "protocol.json",
        "--data-root",
        "data",
        "--case",
        "fixture",
        "--output",
        "records.json",
        "--split",
        "eval",
      ]),
    ).rejects.toThrow("ranking records --split must be train or tune");
  });
});
