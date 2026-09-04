import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { materializeLearnedLayoutPage } from "../src/learned-layout-detector";
import { renderPdfPages } from "../src/render-pdf-pages";
import { buildSharedDetectorSystemInputs } from "../src/shared-layout-detector";

const manifestPath = process.argv[2];
const candidatePath = process.argv[3];
const outputDirectory = process.argv[4];
if (manifestPath === undefined || candidatePath === undefined || outputDirectory === undefined) {
  throw new Error(
    "usage: vite-node materialize_shared_detector_inputs.ts <manifest.json> <candidate.json> <output-directory>",
  );
}

const outputRoot = resolve(outputDirectory);
await mkdir(outputRoot);
await mkdir(resolve(outputRoot, "crops"));
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

for (const corpusItem of manifest.items) {
  const candidateItem = candidateItems.get(corpusItem.id);
  if (candidateItem === undefined) throw new Error(`candidate is missing item: ${corpusItem.id}`);
  const input = await readFile(resolve(corpusRoot, corpusItem.input.path));
  const renderedPages = await renderPdfPages(input, { wasmDirectory, allowLandscape: true, targetWidth: 1400 });
  for (const page of renderedPages) {
    const candidatePage = candidateItem.pages.find((value) => value.pageIndex === page.pageIndex);
    if (candidatePage === undefined) throw new Error(`candidate is missing page: ${corpusItem.id}/${page.pageIndex}`);
    if (candidatePage.status !== "admitted") continue;
    if (candidatePage.renderSha256 !== page.renderSha256) {
      throw new Error(`candidate render hash differs: ${corpusItem.id}/${page.pageIndex}`);
    }
    const segmentation = materializeLearnedLayoutPage(page, candidatePage.rawOutput);
    for (const system of buildSharedDetectorSystemInputs(segmentation)) {
      const id = `${corpusItem.id}-p${String(page.pageIndex + 1).padStart(3, "0")}-s${String(system.systemIndex + 1).padStart(3, "0")}`;
      const absoluteInputPath = resolve(outputRoot, "crops", `${id}.pdf`);
      await writeFile(absoluteInputPath, system.pdfBytes, { flag: "wx" });
      const inputPath = relative(outputRoot, absoluteInputPath);
      items.push({
        id,
        workId: corpusItem.workId,
        pageIndex: system.pageIndex,
        systemIndex: system.systemIndex,
        staffCount: system.staffCount,
        staffLayout: system.staffLayout,
        detectorCropSha256: system.cropSha256,
        input: { path: inputPath, sha256: system.inputSha256 },
        consumerInputSha256: { legato: system.inputSha256, rokot: system.inputSha256 },
      });
    }
  }
}

const output = canonicalJson({
  schemaVersion: "1.0.0",
  detectorVersion: "learned-staff-system-v1",
  sourceManifestSha256: sha256Bytes(manifestBytes),
  candidateReportSha256: sha256Bytes(candidateBytes),
  consumers: ["legato", "rokot"],
  summary: {
    admittedPageCount: candidate.items.flatMap((item) => item.pages).filter((page) => page.status === "admitted")
      .length,
    systemInputCount: items.length,
  },
  items,
});
await writeFile(resolve(outputRoot, "manifest.json"), output, { flag: "wx" });
console.log(JSON.stringify({ systemInputCount: items.length }));
