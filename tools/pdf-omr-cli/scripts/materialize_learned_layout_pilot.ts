import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { PdfOmrError } from "../src/errors";
import { materializeLearnedLayoutPage } from "../src/learned-layout-detector";
import { renderPdfPages } from "../src/render-pdf-pages";

const manifestPath = process.argv[2];
const candidatePath = process.argv[3];
const outputPath = process.argv[4];
if (manifestPath === undefined || candidatePath === undefined || outputPath === undefined) {
  throw new Error(
    "usage: vite-node materialize_learned_layout_pilot.ts <manifest.json> <candidate.json> <output.json>",
  );
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
const candidateBytes = await readFile(resolve(candidatePath));
const candidate = JSON.parse(new TextDecoder().decode(candidateBytes)) as {
  items: Array<{
    itemId: string;
    pages: Array<{ pageIndex: number; renderSha256: string; status: string; rawOutput: unknown }>;
  }>;
};
const candidateItems = new Map(candidate.items.map((item) => [item.itemId, item]));
const corpusRoot = dirname(absoluteManifestPath);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
const items = [];
let materializedPageCount = 0;
let admittedPageCount = 0;

for (const item of manifest.items) {
  const candidateItem = candidateItems.get(item.id);
  if (candidateItem === undefined) throw new Error(`candidate is missing item: ${item.id}`);
  const input = await readFile(resolve(corpusRoot, item.input.path));
  const renderedPages = await renderPdfPages(input, { wasmDirectory, allowLandscape: true, targetWidth: 1400 });
  const pages = [];
  for (const page of renderedPages) {
    const candidatePage = candidateItem.pages.find((value) => value.pageIndex === page.pageIndex);
    if (candidatePage === undefined) throw new Error(`candidate is missing page: ${item.id}/${page.pageIndex}`);
    if (candidatePage.renderSha256 !== page.renderSha256) {
      throw new Error(`candidate render hash differs: ${item.id}/${page.pageIndex}`);
    }
    try {
      const segmentation = materializeLearnedLayoutPage(page, candidatePage.rawOutput);
      materializedPageCount += 1;
      admittedPageCount += Number(candidatePage.status === "admitted");
      pages.push({
        pageIndex: page.pageIndex,
        status: candidatePage.status,
        renderSha256: page.renderSha256,
        systemCount: segmentation.systems.length,
        systems: segmentation.systems.map((system) => ({
          systemIndex: system.systemIndex,
          staffCount: system.staffCount,
          pixelBBox: system.pixelBBox,
          cropSha256: system.cropSha256,
          staffLineYs: system.staffLineYs,
        })),
      });
    } catch (error) {
      pages.push({
        pageIndex: page.pageIndex,
        status: "failed-validation",
        renderSha256: page.renderSha256,
        error:
          error instanceof PdfOmrError
            ? error.toJSON()
            : { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  items.push({ itemId: item.id, pages });
}

const output = canonicalJson({
  schemaVersion: "1.0.0",
  detectorVersion: "learned-staff-system-v1",
  sourceManifestSha256: sha256Bytes(manifestBytes),
  candidateReportSha256: sha256Bytes(candidateBytes),
  summary: {
    pageCount: manifest.items.reduce((sum, item) => sum + candidateItems.get(item.id)!.pages.length, 0),
    materializedPageCount,
    admittedPageCount,
  },
  items,
});
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), output, { flag: "wx" });
console.log(JSON.stringify({ materializedPageCount, admittedPageCount }));
