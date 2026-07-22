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
});
