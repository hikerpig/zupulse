import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { buildFullPageSegmentationPilot } from "../src/benchmark/full-page-segmentation-pilot";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { renderPdfPages } from "../src/render-pdf-pages";
import { pagePreprocessingVariants, type PagePreprocessingVariant } from "../src/page-preprocessing";
import { segmentGrandStaffSystems } from "../src/staff-system-segmentation";

const manifestPath = process.argv[2];
const outputPath = process.argv[3];
const preprocess = process.argv[4] ?? "none";
if (manifestPath === undefined || outputPath === undefined) {
  throw new Error(
    "usage: vite-node run_full_page_segmentation_pilot.ts <manifest.json> <pilot.json> [preprocess-variant]",
  );
}
if (!pagePreprocessingVariants.includes(preprocess as PagePreprocessingVariant)) {
  throw new Error(`unknown preprocessing variant: ${preprocess}`);
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
const corpusRoot = dirname(absoluteManifestPath);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
const report = await buildFullPageSegmentationPilot(
  {
    manifest,
    manifestSha256: sha256Bytes(manifestBytes),
    config: { detector: "rokot-staff-system-v2", preprocess },
  },
  {
    readInput: (path) => readFile(resolve(corpusRoot, path)),
    renderPages: (input) => renderPdfPages(input, { wasmDirectory, allowLandscape: true, targetWidth: 1400 }),
    segmentPage: (page) => segmentGrandStaffSystems([page], { allowFragmentedRuns: true }),
  },
);
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), canonicalJson(report), { flag: "wx" });
console.log(
  JSON.stringify({
    outputPath: resolve(outputPath),
    sha256: sha256Bytes(new TextEncoder().encode(canonicalJson(report))),
  }),
);
