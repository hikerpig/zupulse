import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildFullPageSegmentationPilot } from "../src/benchmark/full-page-segmentation-pilot";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { pagePreprocessingVariants } from "../src/page-preprocessing";
import { renderPdfPages } from "../src/render-pdf-pages";
import { segmentGrandStaffSystems } from "../src/staff-system-segmentation";

const manifestPath = process.argv[2];
const outputDirectory = process.argv[3];
if (manifestPath === undefined || outputDirectory === undefined) {
  throw new Error("usage: vite-node run_full_page_preprocessing_ablation.ts <manifest.json> <new-output-directory>");
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
const corpusRoot = dirname(absoluteManifestPath);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
const absoluteOutputDirectory = resolve(outputDirectory);
await mkdir(absoluteOutputDirectory, { recursive: false });

for (const preprocess of pagePreprocessingVariants) {
  const startedAt = performance.now();
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
  const bytes = new TextEncoder().encode(canonicalJson(report));
  await writeFile(resolve(absoluteOutputDirectory, `${preprocess}.json`), bytes, { flag: "wx" });
  console.log(
    JSON.stringify({
      preprocess,
      reportSha256: sha256Bytes(bytes),
      elapsedMilliseconds: Math.round(performance.now() - startedAt),
      summary: report.summary,
    }),
  );
}
