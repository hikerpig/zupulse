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

  it("retains source provenance for a real scanned sample", () => {
    const manifest = validManifest();
    manifest.items[0]!.provenance = {
      dataset: "OLiMPiC",
      release: "1.0-scanned",
      sampleId: "6586696/p1-s1",
      sourceSplit: "dev",
      archiveSha256: "a".repeat(64),
    };

    expect(verifyCorpusManifest(manifest).items[0]!.provenance?.sampleId).toBe("6586696/p1-s1");
  });

  it("retains an explicit system-crop input scope independently from staff layout", () => {
    const manifest = validManifest();
    manifest.items[0]!.inputScope = "system-crop";
    manifest.items[0]!.staffLayout = "grand-staff";

    expect(verifyCorpusManifest(manifest).items[0]).toMatchObject({
      inputScope: "system-crop",
      staffLayout: "grand-staff",
    });
  });

  it("rejects a system crop without an explicit staff topology", () => {
    const manifest = validManifest();
    manifest.items[0]!.inputScope = "system-crop";

    expect(() => verifyCorpusManifest(manifest)).toThrow(
      expect.objectContaining({
        code: "INVALID_INPUT",
        context: { reason: "system-crop-requires-staff-layout", itemId: "mozart-k545-render" },
      }),
    );
  });

  it("accepts the approved quick and standard execution profiles", () => {
    const quick = profileManifest("quick", 10, []);
    const standard = profileManifest(
      "standard",
      45,
      Array.from({ length: 6 }, (_, index) => `item-${index + 6}`),
    );

    expect(verifyCorpusManifest(quick).execution).toEqual({
      profile: "quick",
      maxTotalWallTimeMs: 600_000,
      repeatItemIds: [],
    });
    expect(verifyCorpusManifest(standard).execution).toEqual({
      profile: "standard",
      maxTotalWallTimeMs: 3_600_000,
      repeatItemIds: ["item-6", "item-7", "item-8", "item-9", "item-10", "item-11"],
    });
  });

  it.each([
    ["quick item count", profileManifest("quick", 9, []), "quick-item-count"],
    ["quick repetitions", profileManifest("quick", 10, ["item-1"]), "quick-repeat-items"],
    [
      "quick split",
      {
        ...profileManifest("quick", 10, []),
        items: profileManifest("quick", 10, []).items.map((item, index) =>
          index === 0 ? { ...item, split: "holdout" as const } : item,
        ),
      },
      "quick-split",
    ],
    [
      "quick composition",
      {
        ...profileManifest("quick", 10, []),
        items: profileManifest("quick", 10, []).items.map((item) => ({
          ...item,
          benchmarkSuite: "oracle-system" as const,
        })),
      },
      "quick-suite-composition",
    ],
    ["standard item count", profileManifest("standard", 44, []), "standard-item-count"],
    ["standard repetitions", profileManifest("standard", 45, ["item-1"]), "standard-repeat-items"],
    [
      "standard mixed splits",
      {
        ...profileManifest(
          "standard",
          45,
          Array.from({ length: 6 }, (_, index) => `item-${index + 6}`),
        ),
        items: profileManifest(
          "standard",
          45,
          Array.from({ length: 6 }, (_, index) => `item-${index + 6}`),
        ).items.map((item, index) => (index === 0 ? { ...item, split: "holdout" as const } : item)),
      },
      "standard-mixed-splits",
    ],
    [
      "standard budget",
      {
        ...profileManifest(
          "standard",
          45,
          Array.from({ length: 6 }, (_, index) => `item-${index + 6}`),
        ),
        execution: {
          profile: "standard" as const,
          maxTotalWallTimeMs: 3_599_999,
          repeatItemIds: Array.from({ length: 6 }, (_, index) => `item-${index + 6}`),
        },
      },
      "standard-time-budget",
    ],
    [
      "unknown repeat item",
      profileManifest("standard", 45, ["item-6", "item-7", "item-8", "item-9", "item-10", "missing"]),
      "unknown-repeat-item",
    ],
  ])("rejects invalid %s", (_label, manifest, reason) => {
    expect(() => verifyCorpusManifest(manifest)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT", context: expect.objectContaining({ reason }) }),
    );
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
        provenance: {
          dataset: "example",
          release: "1",
          sampleId: "example/sample",
          sourceSplit: "dev",
          archiveSha256: "a".repeat(64),
        },
      },
    ],
  };
}

function profileManifest(profile: "quick" | "standard", itemCount: number, repeatItemIds: string[]) {
  const template = validManifest().items[0]!;
  return {
    schemaVersion: "1.0.0" as const,
    corpusId: `public-pianoform-${profile}-v1`,
    protocolVersion: "3.0.0",
    execution: {
      profile,
      maxTotalWallTimeMs: profile === "quick" ? 600_000 : 3_600_000,
      repeatItemIds,
    },
    items: Array.from({ length: itemCount }, (_, index) => ({
      ...template,
      id: `item-${index + 1}`,
      workId: `work-${index + 1}`,
      benchmarkSuite:
        profile === "quick"
          ? index < 2
            ? ("contract" as const)
            : index < 8
              ? ("oracle-system" as const)
              : ("full-page" as const)
          : index < 5
            ? ("contract" as const)
            : index < 41
              ? ("oracle-system" as const)
              : ("full-page" as const),
    })),
  };
}
