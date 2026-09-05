import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { PdfOmrError } from "../src/errors";
import { encodeRgbaPng, renderPdfPages } from "../src/render-pdf-pages";
import { segmentStaffSystems, type StaffLayout } from "../src/staff-system-segmentation";

const pdfPath = process.argv[2];
const outputRoot = process.argv[3];
if (pdfPath === undefined || outputRoot === undefined) {
  throw new Error("usage: vite-node probe_k331_classic_layout.ts <pdf> <output-directory>");
}

const absolutePdfPath = resolve(pdfPath);
const absoluteOutputRoot = resolve(outputRoot);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
await mkdir(absoluteOutputRoot, { recursive: true });

const pdfBytes = await readFile(absolutePdfPath);
const pages = await renderPdfPages(pdfBytes, { wasmDirectory, allowLandscape: true, targetWidth: 1400 });

const variants: Array<{
  id: string;
  allowFragmentedRuns: boolean;
  staffLayout: StaffLayout;
  pairAdjacentUnpairedGroups: boolean;
}> = [
  { id: "runtime-fragmented-auto", allowFragmentedRuns: true, staffLayout: "auto", pairAdjacentUnpairedGroups: false },
  {
    id: "runtime-fragmented-grand-staff",
    allowFragmentedRuns: true,
    staffLayout: "grand-staff",
    pairAdjacentUnpairedGroups: false,
  },
  {
    id: "historical-non-fragmented-grand-staff",
    allowFragmentedRuns: false,
    staffLayout: "grand-staff",
    pairAdjacentUnpairedGroups: false,
  },
  {
    id: "pair-adjacent-fragmented-grand-staff",
    allowFragmentedRuns: true,
    staffLayout: "grand-staff",
    pairAdjacentUnpairedGroups: true,
  },
];

const pageRecords = [];
for (const page of pages) {
  const relativePath = `page-${page.pageIndex + 1}.png`;
  await writeFile(
    resolve(absoluteOutputRoot, relativePath),
    encodeRgbaPng(page.pixelWidth, page.pixelHeight, page.pixels),
    {
      flag: "wx",
    },
  );
  pageRecords.push({
    pageIndex: page.pageIndex,
    path: relativePath,
    pixelWidth: page.pixelWidth,
    pixelHeight: page.pixelHeight,
    renderSha256: page.renderSha256,
  });
}

const variantResults = [];
for (const variant of variants) {
  const pagesResult: object[] = [];
  for (const page of pages) {
    try {
      const segmentation = segmentStaffSystems([page], variant);
      pagesResult.push({
        pageIndex: page.pageIndex,
        status: "admitted",
        systemCount: segmentation.systems.length,
        staffCounts: segmentation.systems.map((system) => system.staffCount),
        systems: segmentation.systems.map((system) => ({
          systemIndex: system.systemIndex,
          staffCount: system.staffCount,
          staffLayout: system.staffLayout,
          pixelBBox: system.pixelBBox,
          staffLineYs: system.staffLineYs,
        })),
      });
    } catch (error) {
      const stage =
        error instanceof PdfOmrError && typeof error.context?.stage === "string" ? error.context.stage : "unknown";
      pagesResult.push({
        pageIndex: page.pageIndex,
        status: "failed",
        stage,
        systemCount: 0,
      });
    }
  }
  variantResults.push({
    id: variant.id,
    ...variant,
    admittedPageCount: pagesResult.filter((page) => "status" in page && page.status === "admitted").length,
    pages: pagesResult,
  });
}

const report = {
  schemaVersion: "1.0.0",
  detectorVersion: "rokot-staff-system-v2",
  pdfSha256: sha256Bytes(pdfBytes),
  pageCount: pages.length,
  pages: pageRecords,
  variants: variantResults,
};
await writeFile(resolve(absoluteOutputRoot, "classic-probe.json"), canonicalJson(report), { flag: "wx" });
console.log(
  JSON.stringify(
    {
      pageCount: pages.length,
      variants: variantResults.map((variant) => ({
        id: variant.id,
        admittedPageCount: variant.admittedPageCount,
        pages: variant.pages.map((page) => ({
          pageIndex: (page as { pageIndex: number }).pageIndex,
          status: (page as { status: string }).status,
          systemCount: (page as { systemCount?: number }).systemCount,
          stage: (page as { stage?: string }).stage,
        })),
      })),
    },
    null,
    2,
  ),
);
