import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateAsapCorpus } from "../adapters/asapEvaluation";

describe("ASAP ingestion evaluator", () => {
  it("reports structure and runtime without chord accuracy metrics", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "zupulse-asap-"));
    try {
      const fixture = fileURLToPath(
        new URL("../../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url),
      );
      await cp(fixture, resolve(root, "simple.mxl"));

      const report = await evaluateAsapCorpus(root, { id: "asap", include: ["simple.mxl"] });

      expect(report).toMatchObject({
        kind: "ingestion-corpus",
        adapter: "asap",
        status: "passed",
        files: 1,
        parsed: 1,
        failed: 0,
        notes: 1,
        measures: 1,
      });
      expect(report.segments).toBeGreaterThan(0);
      expect(report.runtimeMs).toBeGreaterThanOrEqual(0);
      expect(report).not.toHaveProperty("metrics");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
