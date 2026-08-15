import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyCorpusManifest } from "../benchmark/corpus";
import { runBenchmark } from "../benchmark/run-benchmark";
import { verifyFrozenProtocol } from "../benchmark/verify-protocol";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { inspectPdfBytes } from "../inspect-pdf";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

const manifestPath = fileURLToPath(new URL("../../corpus/olimpic-scanned-v1/manifest.json", import.meta.url));
const corpusRoot = dirname(manifestPath);

describe("OLiMPiC scanned corpus v1", () => {
  it("has reproducible source hashes and ready system-level ground truth", async () => {
    const manifest = verifyCorpusManifest(JSON.parse(await readFile(manifestPath, "utf8")));

    expect(manifest.items).toHaveLength(2);
    expect(new Set(manifest.items.map((item) => item.split))).toEqual(new Set(["development", "holdout"]));
    for (const item of manifest.items) {
      expect(item.category).toBe("real-scanned-system");
      expect(item.provenance?.dataset).toBe("OLiMPiC scanned");
      const [input, groundTruth] = await Promise.all([
        readFile(resolve(corpusRoot, item.input.path)),
        readFile(resolve(corpusRoot, item.groundTruth.path)),
      ]);
      expect(sha256Bytes(input)).toBe(item.input.sha256);
      expect(sha256Bytes(groundTruth)).toBe(item.groundTruth.sha256);
      const validation = validateDraft(normalizeAudiverisMusicXml(groundTruth));
      expect(validation.readiness).toEqual({ harmony: "ready", musicXml: "ready" });
      await expect(inspectPdfBytes(input, { fileName: item.input.path })).resolves.toMatchObject({ pageCount: 1 });
    }
  });

  it("freezes protocol identity and keeps holdout hidden by default", async () => {
    const manifestBytes = await readFile(manifestPath);
    const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
    const protocolPath = resolve(corpusRoot, "protocol.json");
    const protocolBytes = await readFile(protocolPath);
    const protocol = verifyFrozenProtocol(protocolBytes, {
      protocolSha256: sha256Bytes(protocolBytes),
      manifestSha256: sha256Bytes(manifestBytes),
      engineId: "rokot",
      preprocess: "none",
    });

    expect(protocol).toMatchObject({
      benchmarkCommit: "c085814",
      render: { id: "olimpic-source-pdf" },
      segmentation: { scope: "system-crop" },
      decoder: { id: "rokot-abc" },
    });
    expect(manifest.items.find((item) => item.split === "holdout")?.id).toBe("openscore-6245974-p1-s1");
  });

  it("runs a deterministic development smoke without reading the holdout item", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "olimpic-scanned-benchmark-"));
    const outputDirectory = join(parentDirectory, "result");
    const result = await runBenchmark(
      {
        manifestPath,
        engineId: "rokot",
        preprocess: "none",
        outputDirectory,
        mode: "development",
      },
      {
        runItem: async (item) => {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "test engine is intentionally unavailable", {
            context: { itemId: item.id },
          });
        },
      },
    );

    expect(result.report.items).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(result.report.failures).toEqual([
      { itemId: "openscore-6586696-p1-s1", category: "real-scanned-system", code: "ENGINE_UNAVAILABLE" },
    ]);
    await expect(
      readFile(join(outputDirectory, "items", "openscore-6586696-p1-s1", "error.json"), "utf8"),
    ).resolves.toContain("ENGINE_UNAVAILABLE");
  });
});
