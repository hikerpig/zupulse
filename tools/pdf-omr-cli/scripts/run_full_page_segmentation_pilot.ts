import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { verifyCorpusManifest } from "../src/benchmark/corpus";
import { PdfOmrError } from "../src/errors";
import { renderPdfPages, type RenderedPdfPage } from "../src/render-pdf-pages";
import { STAFF_SYSTEM_SEGMENTATION_PARAMETERS, segmentGrandStaffSystems } from "../src/staff-system-segmentation";

type PilotPage = {
  pageIndex: number;
  renderSha256?: string;
  status: "succeeded" | "failed";
  systems?: Array<{
    systemIndex: number;
    pixelBBox: { x: number; y: number; width: number; height: number };
    pdfPointBBox: { x: number; y: number; width: number; height: number };
    cropSha256: string;
  }>;
  error?: ReturnType<PdfOmrError["toJSON"]>;
};

const manifestPath = process.argv[2];
const outputPath = process.argv[3];
if (manifestPath === undefined || outputPath === undefined) {
  throw new Error("usage: vite-node run_full_page_segmentation_pilot.ts <manifest.json> <pilot.json>");
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
const corpusRoot = dirname(absoluteManifestPath);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
const items: Array<{
  itemId: string;
  inputSha256: string;
  status: "succeeded" | "failed";
  pageCount: number;
  systemCount: number;
  pages: PilotPage[];
}> = [];

for (const item of manifest.items.filter((candidate) => candidate.split === "development")) {
  const input = await readFile(resolve(corpusRoot, item.input.path));
  const pages = await renderPdfPages(input, { wasmDirectory, allowLandscape: true });
  const pilotPages = pages.map((page) => segmentPage(page));
  const failures = pilotPages.filter((page) => page.status === "failed");
  const systemCount = pilotPages.reduce((total, page) => total + (page.systems?.length ?? 0), 0);
  items.push({
    itemId: item.id,
    inputSha256: item.input.sha256,
    status: failures.length === 0 ? "succeeded" : "failed",
    pageCount: pages.length,
    systemCount,
    pages: pilotPages,
  });
}

const report = {
  schemaVersion: "1.0.0",
  corpusId: manifest.corpusId,
  manifestSha256: sha256Bytes(manifestBytes),
  detector: {
    id: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
    scope: "full-page",
    allowFragmentedRuns: true,
    allowLandscape: true,
  },
  items,
};
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), canonicalJson(report), { flag: "wx" });
console.log(
  JSON.stringify({
    outputPath: resolve(outputPath),
    sha256: sha256Bytes(new TextEncoder().encode(canonicalJson(report))),
  }),
);

function segmentPage(page: RenderedPdfPage): PilotPage {
  try {
    const segmentation = segmentGrandStaffSystems([page], { allowFragmentedRuns: true });
    return {
      pageIndex: page.pageIndex,
      renderSha256: page.renderSha256,
      status: "succeeded",
      systems: segmentation.systems.map((system) => ({
        systemIndex: system.systemIndex,
        pixelBBox: system.pixelBBox,
        pdfPointBBox: system.pdfPointBBox,
        cropSha256: system.cropSha256,
      })),
    };
  } catch (error) {
    const canonical =
      error instanceof PdfOmrError
        ? error
        : new PdfOmrError("ENGINE_OUTPUT_INVALID", "full-page segmentation failed", { cause: error });
    return {
      pageIndex: page.pageIndex,
      renderSha256: page.renderSha256,
      status: "failed",
      error: canonical.toJSON(),
    };
  }
}
