import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { PdfOmrError } from "../src/errors";
import {
  isPianoGrandStaffTopologyExact,
  pianoGrandStaffMappingSchema,
  type PianoGrandStaffMapping,
} from "../src/piano-grand-staff-topology";
import { encodeRgbaPagesAsPdf } from "../src/raster-pdf";
import { renderPdfPages, type RenderedPdfPage } from "../src/render-pdf-pages";
import {
  PIANO_GRAND_STAFF_SEGMENTATION_V1,
  resolveFullPageSegmentation,
  segmentStaffSystems,
  type StaffSystem,
} from "../src/staff-system-segmentation";

const pdfPath = process.argv[2];
const mappingPath = process.argv[3];
const outputRoot = process.argv[4];
if (pdfPath === undefined || mappingPath === undefined || outputRoot === undefined) {
  throw new Error(
    "usage: vite-node materialize-k331-piano-grand-staff.ts <pdf> <source-mapping.json> <output-directory>",
  );
}

const absoluteOutputRoot = resolve(outputRoot);
await mkdir(absoluteOutputRoot);
const wasmDirectory = resolve(process.cwd(), "node_modules/pdfjs-dist/wasm");
const frozenMappingSha256 = "0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8";
const pdfBytes = await readFile(resolve(pdfPath));
const mappingBytes = await readFile(resolve(mappingPath));
const mapping = pianoGrandStaffMappingSchema.parse(JSON.parse(new TextDecoder().decode(mappingBytes)));
const pdfSha256 = sha256Bytes(pdfBytes);
const mappingSha256 = sha256Bytes(new TextEncoder().encode(`${JSON.stringify(JSON.parse(canonicalJson(mapping)))}\n`));
if (pdfSha256 !== mapping.pdfSha256) {
  throw new Error(`PDF hash mismatch: ${pdfSha256} !== ${mapping.pdfSha256}`);
}
if (mappingSha256 !== frozenMappingSha256) {
  throw new Error(`mapping canonical hash mismatch: ${mappingSha256} !== ${frozenMappingSha256}`);
}

const runA = await materializeRun(pdfBytes, mapping, mappingSha256, wasmDirectory);
const runB = await materializeRun(pdfBytes, mapping, mappingSha256, wasmDirectory);
const reportABytes = new TextEncoder().encode(canonicalJson(runA.report));
const reportBBytes = new TextEncoder().encode(canonicalJson(runB.report));
const reportASha256 = sha256Bytes(reportABytes);
const reportBSha256 = sha256Bytes(reportBBytes);
if (reportASha256 !== reportBSha256) {
  throw new Error(`dual-run report hash mismatch: ${reportASha256} !== ${reportBSha256}`);
}
if (runA.report.cropSha256.join(" ") !== runB.report.cropSha256.join(" ")) {
  throw new Error("dual-run crop hash sequence mismatch");
}

await writeFile(resolve(absoluteOutputRoot, "run-a.json"), reportABytes, { flag: "wx" });
await writeFile(resolve(absoluteOutputRoot, "run-b.json"), reportBBytes, { flag: "wx" });

const layoutGatePassed =
  runA.report.exactPageCount === mapping.pages.length &&
  runA.report.systemCount === mapping.expectedSystemCounts.reduce((sum, count) => sum + count, 0) &&
  runA.report.cropSha256.length === runA.report.systemCount &&
  runA.report.pages.every((page) => page.status === "topology-exact");

if (layoutGatePassed) {
  await mkdir(resolve(absoluteOutputRoot, "crops"));
  for (const system of runA.systems) {
    const relativePath = `crops/p${String(system.pageIndex + 1).padStart(2, "0")}-s${String(system.systemIndex + 1).padStart(2, "0")}.pdf`;
    const pdf = encodeRgbaPagesAsPdf([
      { width: system.pixelBBox.width, height: system.pixelBBox.height, pixels: system.cropPixels },
    ]);
    await writeFile(resolve(absoluteOutputRoot, relativePath), pdf, { flag: "wx" });
  }
}

const summary = {
  schemaVersion: "1.0.0",
  identity: PIANO_GRAND_STAFF_SEGMENTATION_V1,
  pdfSha256,
  mappingSha256,
  expectedSystemCounts: mapping.expectedSystemCounts,
  exactPageCount: runA.report.exactPageCount,
  pageCount: mapping.pages.length,
  systemCount: runA.report.systemCount,
  cropSha256: runA.report.cropSha256,
  reportSha256: reportASha256,
  dualRunMatched: true,
  layoutGate: layoutGatePassed ? "pass" : "fail",
};
await writeFile(resolve(absoluteOutputRoot, "summary.json"), canonicalJson(summary), { flag: "wx" });
console.log(
  JSON.stringify(
    {
      layoutGate: summary.layoutGate,
      exactPageCount: summary.exactPageCount,
      systemCount: summary.systemCount,
      reportSha256: summary.reportSha256,
    },
    null,
    2,
  ),
);
if (!layoutGatePassed) process.exitCode = 1;

async function materializeRun(
  input: Uint8Array,
  truth: PianoGrandStaffMapping,
  mappingSha256: string,
  wasm: string,
): Promise<{ report: CanonicalLayoutReport; systems: StaffSystem[] }> {
  const pages = await renderPdfPages(input, { wasmDirectory: wasm, allowLandscape: true, targetWidth: 1400 });
  const options = resolveFullPageSegmentation({ segmentationId: PIANO_GRAND_STAFF_SEGMENTATION_V1.id });
  const pageReports: CanonicalPageReport[] = [];
  const systems: StaffSystem[] = [];
  for (const [index, page] of pages.entries()) {
    const truthPage = truth.pages[index];
    if (truthPage === undefined || truthPage.pageIndex !== page.pageIndex) {
      throw new Error(`mapping is missing page ${page.pageIndex}`);
    }
    if (page.renderSha256 !== truthPage.renderSha256) {
      throw new Error(`render hash mismatch on page ${page.pageIndex}`);
    }
    pageReports.push(segmentPage(page, truthPage, options, systems));
  }
  const exactPageCount = pageReports.filter((page) => page.status === "topology-exact").length;
  return {
    systems,
    report: {
      schemaVersion: "1.0.0",
      identity: PIANO_GRAND_STAFF_SEGMENTATION_V1,
      pdfSha256: sha256Bytes(input),
      mappingSha256,
      pageCount: pages.length,
      exactPageCount,
      systemCount: systems.length,
      cropSha256: systems.map((system) => system.cropSha256),
      pages: pageReports,
    },
  };
}

function segmentPage(
  page: RenderedPdfPage,
  truthPage: PianoGrandStaffMapping["pages"][number],
  options: ReturnType<typeof resolveFullPageSegmentation>,
  systems: StaffSystem[],
): CanonicalPageReport {
  try {
    const segmentation = segmentStaffSystems([page], options);
    const topologyExact = isPianoGrandStaffTopologyExact(segmentation.systems, truthPage);
    if (!topologyExact) {
      return {
        pageIndex: page.pageIndex,
        renderSha256: page.renderSha256,
        status: "topology-mismatch",
        systemCount: segmentation.systems.length,
        staffCounts: segmentation.systems.map((system) => system.staffCount),
      };
    }
    systems.push(...segmentation.systems);
    return {
      pageIndex: page.pageIndex,
      renderSha256: page.renderSha256,
      status: "topology-exact",
      systemCount: segmentation.systems.length,
      staffCounts: segmentation.systems.map((system) => system.staffCount),
      systems: segmentation.systems.map((system) => ({
        systemIndex: system.systemIndex,
        staffCount: system.staffCount,
        staffLayout: system.staffLayout,
        pixelBBox: system.pixelBBox,
        cropSha256: system.cropSha256,
      })),
    };
  } catch (error) {
    const stage =
      error instanceof PdfOmrError && typeof error.context?.stage === "string" ? error.context.stage : "unknown";
    return {
      pageIndex: page.pageIndex,
      renderSha256: page.renderSha256,
      status: "failed",
      stage,
      systemCount: 0,
    };
  }
}

type CanonicalPageReport = {
  pageIndex: number;
  renderSha256: string;
  status: "topology-exact" | "topology-mismatch" | "failed";
  systemCount: number;
  staffCounts?: readonly number[];
  stage?: string;
  systems?: readonly {
    systemIndex: number;
    staffCount: number;
    staffLayout: string;
    pixelBBox: { x: number; y: number; width: number; height: number };
    cropSha256: string;
  }[];
};

type CanonicalLayoutReport = {
  schemaVersion: "1.0.0";
  identity: typeof PIANO_GRAND_STAFF_SEGMENTATION_V1;
  pdfSha256: string;
  mappingSha256: string;
  pageCount: number;
  exactPageCount: number;
  systemCount: number;
  cropSha256: readonly string[];
  pages: readonly CanonicalPageReport[];
};
