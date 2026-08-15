import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyCorpusManifest } from "../benchmark/corpus";
import { verifyFrozenProtocol } from "../benchmark/verify-protocol";
import { sha256Bytes } from "../canonical-json";
import { inspectPdfBytes } from "../inspect-pdf";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

const manifestPath = fileURLToPath(
  new URL("../../corpus/olimpic-scanned-full-page-dev-v1/manifest.json", import.meta.url),
);
const corpusRoot = dirname(manifestPath);

describe("OLiMPiC full-page development corpus v1", () => {
  it("verifies the frozen manifest, source mappings, page integrity and GT readiness", async () => {
    const manifestBytes = await readFile(manifestPath);
    const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));

    expect(manifest.corpusId).toBe("olimpic-scanned-full-page-dev-v1");
    expect(manifest.items).toHaveLength(6);
    expect(new Set(manifest.items.map((item) => item.split))).toEqual(new Set(["development"]));

    let pageCount = 0;
    let systemCount = 0;
    for (const item of manifest.items) {
      const [inputBytes, truthBytes, mappingBytes] = await Promise.all([
        readFile(resolve(corpusRoot, item.input.path)),
        readFile(resolve(corpusRoot, item.groundTruth.path)),
        readFile(resolve(corpusRoot, "dev", item.workId.replace(/^olimpic-/, ""), "source-mapping.json")),
      ]);
      expect(sha256Bytes(inputBytes)).toBe(item.input.sha256);
      expect(sha256Bytes(truthBytes)).toBe(item.groundTruth.sha256);
      const mapping = JSON.parse(new TextDecoder().decode(mappingBytes)) as {
        workId: string;
        pages: Array<{ samplePage: number; sourcePage: number; systems: unknown[] }>;
      };
      expect(mapping.workId).toBe(item.workId.replace(/^olimpic-/, ""));
      const inspect = await inspectPdfBytes(inputBytes, {
        fileName: item.input.path,
        wasmDirectory: resolve(corpusRoot, "../../../../node_modules/pdfjs-dist/wasm"),
      });
      expect(inspect.pageCount).toBe(mapping.pages.length);
      expect(mapping.pages.map((page) => page.samplePage)).toEqual(
        Array.from({ length: mapping.pages.length }, (_, index) => index + 1),
      );
      pageCount += inspect.pageCount;
      systemCount += mapping.pages.reduce((total, page) => total + page.systems.length, 0);

      const validation = validateDraft(normalizeAudiverisMusicXml(truthBytes));
      expect(validation.diagnostics.every((diagnostic) => diagnostic.code.length > 0)).toBe(true);
    }
    expect(pageCount).toBe(29);
    expect(systemCount).toBe(121);
  });

  it("binds full-page scope and resource gates to the manifest", async () => {
    const manifestBytes = await readFile(manifestPath);
    const protocolPath = resolve(corpusRoot, "protocol.json");
    const protocolBytes = await readFile(protocolPath);
    const protocol = verifyFrozenProtocol(protocolBytes, {
      protocolSha256: sha256Bytes(protocolBytes),
      manifestSha256: sha256Bytes(manifestBytes),
      engineId: "rokot",
      preprocess: "none",
    });

    expect(protocol).toMatchObject({
      benchmarkCommit: "d103b99",
      render: { id: "olimpic-source-pdf", dpi: 300 },
      segmentation: { id: "rokot-grand-staff-v2", scope: "full-page" },
      builder: { id: "build_olimpic_full_page_corpus.py" },
      decoder: { id: "rokot-abc" },
      gates: {
        maxWallTimeP95Ms: 1_800_000,
        maxPeakRssP95Bytes: 8_589_934_592,
        maxGpuMemoryP95Bytes: 17_179_869_184,
      },
    });
  });

  it("retains auditable page-level segmentation failures", async () => {
    const pilotPath = resolve(
      corpusRoot,
      "../../reports/development/olimpic-scanned-full-page-v1-segmentation-pilot/segmentation.json",
    );
    const pilotBytes = await readFile(pilotPath);
    expect(sha256Bytes(pilotBytes)).toBe("1fa116866674160f494e06310592b8f56a92e580ae21b464a4098fe9d6254d86");
    const pilot = JSON.parse(new TextDecoder().decode(pilotBytes)) as {
      corpusId: string;
      detector: { scope: string };
      items: Array<{
        pageCount: number;
        systemCount: number;
        pages: Array<{ status: string; error?: { code: string; context?: Record<string, unknown> } }>;
      }>;
    };
    expect(pilot).toMatchObject({ corpusId: "olimpic-scanned-full-page-dev-v1", detector: { scope: "full-page" } });
    expect(pilot.items).toHaveLength(6);
    expect(pilot.items.reduce((total, item) => total + item.pageCount, 0)).toBe(29);
    expect(pilot.items.every((item) => item.systemCount === 0)).toBe(true);
    expect(
      pilot.items.every((item) =>
        item.pages.every(
          (page) =>
            page.status === "failed" &&
            page.error?.code === "ENGINE_OUTPUT_INVALID" &&
            page.error.context?.reason === "ambiguous-system-segmentation",
        ),
      ),
    ).toBe(true);
  });
});
