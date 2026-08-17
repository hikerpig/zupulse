import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { materializeLegatoSystemPages } from "../benchmark/legato-system-pages";
import { verifyCorpusManifest } from "../benchmark/corpus";
import { renderPdfPages } from "../render-pdf-pages";

const manifestPath = fileURLToPath(new URL("../../corpus/evaluation/manifest.json", import.meta.url));

describe("materializeLegatoSystemPages", () => {
  it("materializes only development full-page items as system-page PDFs", async () => {
    const root = await mkdtemp(join(tmpdir(), "legato-system-pages-"));
    const outputDirectory = join(root, "output");

    const result = await materializeLegatoSystemPages({ manifestPath, outputDirectory });

    const manifestBytes = await readFile(result.manifestPath);
    const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
    expect(manifest.items.map((item) => item.id)).toEqual(["melody-blur", "melody-clean", "melody-low-contrast"]);
    expect(manifest.items.every((item) => item.split === "development")).toBe(true);
    expect(result.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
    await expect(readFile(result.materializationPath)).resolves.not.toHaveLength(0);

    for (const item of manifest.items) {
      const pages = await renderPdfPages(await readFile(join(outputDirectory, item.input.path)), {
        allowLandscape: true,
      });
      expect(pages).toHaveLength(2);
    }
  }, 15_000);
});
