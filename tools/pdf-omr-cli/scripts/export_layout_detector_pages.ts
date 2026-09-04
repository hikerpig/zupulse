import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { encodeRgbaPng, renderPdfPages } from "../src/render-pdf-pages";

const manifestPath = process.argv[2];
const outputRoot = process.argv[3];
if (manifestPath === undefined || outputRoot === undefined) {
  throw new Error("usage: vite-node export_layout_detector_pages.ts <manifest.json> <output-directory>");
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
const corpusRoot = dirname(absoluteManifestPath);
const absoluteOutputRoot = resolve(outputRoot);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
await mkdir(absoluteOutputRoot);

const items = [];
for (const item of manifest.items) {
  const input = await readFile(resolve(corpusRoot, item.input.path));
  const pages = await renderPdfPages(input, { wasmDirectory, allowLandscape: true, targetWidth: 1400 });
  const itemRoot = resolve(absoluteOutputRoot, item.id);
  await mkdir(itemRoot);
  const pageRecords = [];
  for (const page of pages) {
    const png = encodeRgbaPng(page.pixelWidth, page.pixelHeight, page.pixels);
    const relativePath = `${item.id}/page-${page.pageIndex + 1}.png`;
    await writeFile(resolve(absoluteOutputRoot, relativePath), png, { flag: "wx" });
    pageRecords.push({
      pageIndex: page.pageIndex,
      path: relativePath,
      pixelWidth: page.pixelWidth,
      pixelHeight: page.pixelHeight,
      renderSha256: page.renderSha256,
      pngSha256: sha256Bytes(png),
    });
  }
  items.push({ itemId: item.id, inputSha256: item.input.sha256, pages: pageRecords });
}

const outputManifest = canonicalJson({
  schemaVersion: "1.0.0",
  corpusId: manifest.corpusId,
  sourceManifestSha256: sha256Bytes(manifestBytes),
  renderer: { id: "pdfjs", targetWidth: 1400 },
  items,
});
await writeFile(resolve(absoluteOutputRoot, "manifest.json"), outputManifest, { flag: "wx" });
console.log(JSON.stringify({ pageCount: items.reduce((sum, item) => sum + item.pages.length, 0) }));
