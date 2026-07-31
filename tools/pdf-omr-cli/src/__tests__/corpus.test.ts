import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { corpusManifestSchema, verifyCorpusManifest } from "../benchmark/corpus";
import { createCorpusView } from "../benchmark/protocol";

describe("PDF OMR corpus protocol", () => {
  it("rejects work-level leakage across development and holdout", () => {
    const manifest = validManifest();
    manifest.items.push({
      ...manifest.items[0]!,
      id: "mozart-k545-scan",
      variantId: "scan",
      split: "holdout",
    });

    expect(() => verifyCorpusManifest(manifest)).toThrow(
      expect.objectContaining({
        code: "INVALID_INPUT",
        context: { reason: "work-split-leakage", workId: "mozart-k545" },
      }),
    );
  });

  it("requires hashes, ground truth and license metadata", () => {
    const manifest = validManifest() as Record<string, unknown>;
    const item = (manifest.items as Array<Record<string, unknown>>)[0]!;
    delete (item.input as Record<string, unknown>).sha256;
    delete item.license;

    expect(() => corpusManifestSchema.parse(manifest)).toThrow();
  });

  it("hides holdout item details from the default development view", () => {
    const manifest = validManifest();
    manifest.items.push({
      ...manifest.items[0]!,
      id: "bach-bwv846-scan",
      workId: "bach-bwv846",
      variantId: "scan",
      split: "holdout",
    });
    const verified = verifyCorpusManifest(manifest);

    const view = createCorpusView(verified, { mode: "development" });

    expect(view.items.map((item) => item.id)).toEqual(["mozart-k545-render"]);
    expect(JSON.stringify(view)).not.toContain("bach-bwv846-scan");
    expect(view.holdout).toEqual({ itemCount: 1, details: "redacted" });
  });

  it("requires an explicit frozen-evaluation capability to reveal holdout items", () => {
    const manifest = verifyCorpusManifest({
      ...validManifest(),
      items: [{ ...validManifest().items[0]!, split: "holdout" as const }],
    });

    expect(() => createCorpusView(manifest, { mode: "holdout" })).toThrow(
      expect.objectContaining({ code: "INVALID_CLI_ARGUMENT" }),
    );
    expect(
      createCorpusView(manifest, {
        mode: "holdout",
        frozenEvaluation: { protocolSha256: "b".repeat(64) },
      }).items,
    ).toHaveLength(1);
  });

  it("keeps the repository K331 fixture in a development-only derived-controlled corpus", async () => {
    const manifestPath = fileURLToPath(
      new URL("../../../../test-fixtures/musicxml/K331-3_rokot-development-manifest.json", import.meta.url),
    );
    const manifest = verifyCorpusManifest(JSON.parse(await readFile(manifestPath, "utf8")));

    const view = createCorpusView(manifest, { mode: "development" });

    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({
      id: "mozart-k331-3-derived-render",
      split: "development",
      category: "derived-controlled-grand-staff",
    });
    expect(view.holdout).toEqual({ itemCount: 0, details: "redacted" });
    const corpusRoot = dirname(manifestPath);
    for (const item of view.items) {
      const [input, groundTruth] = await Promise.all([
        readFile(resolve(corpusRoot, item.input.path)),
        readFile(resolve(corpusRoot, item.groundTruth.path)),
      ]);
      expect(createHash("sha256").update(input).digest("hex")).toBe(item.input.sha256);
      expect(createHash("sha256").update(groundTruth).digest("hex")).toBe(item.groundTruth.sha256);
    }
  });
});

function validManifest() {
  return {
    schemaVersion: "1.0.0" as const,
    corpusId: "smoke-v1",
    protocolVersion: "1.0.0",
    items: [
      {
        id: "mozart-k545-render",
        workId: "mozart-k545",
        variantId: "render",
        split: "development" as const,
        category: "digital-vector",
        input: { path: "inputs/mozart-k545.pdf", sha256: "a".repeat(64) },
        groundTruth: {
          path: "ground-truth/mozart-k545.mxl",
          sha256: "b".repeat(64),
          format: "mxl" as const,
        },
        license: { id: "CC0-1.0", source: "https://example.test/license" },
      },
    ],
  };
}
