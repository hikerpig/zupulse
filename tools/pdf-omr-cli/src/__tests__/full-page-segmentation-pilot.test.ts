import { describe, expect, it } from "vitest";
import {
  buildFullPageSegmentationPilot,
  fullPageSegmentationPilotReportSchema,
} from "../benchmark/full-page-segmentation-pilot";
import type { CorpusManifest } from "../benchmark/corpus";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import type { RenderedPdfPage } from "../render-pdf-pages";
import type { StaffSystemSegmentation } from "../staff-system-segmentation";

describe("full-page segmentation pilot", () => {
  it("reads only development inputs and emits deterministic aggregate evidence", async () => {
    const developmentInput = new TextEncoder().encode("development-pdf");
    const holdoutInput = new TextEncoder().encode("holdout-pdf");
    const manifest = corpusManifest(developmentInput, holdoutInput);
    const reads: string[] = [];
    const dependencies = {
      async readInput(path: string) {
        reads.push(path);
        return path === "dev/input.pdf" ? developmentInput : holdoutInput;
      },
      async renderPages() {
        return [renderedPage(0), renderedPage(1)];
      },
      segmentPage(page: RenderedPdfPage) {
        return segmentation(page.pageIndex);
      },
    };

    const first = await buildFullPageSegmentationPilot(
      {
        manifest,
        manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
        config: { detector: "rokot-staff-system-v2", preprocess: "none" },
      },
      dependencies,
    );
    const second = await buildFullPageSegmentationPilot(
      {
        manifest,
        manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
        config: { detector: "rokot-staff-system-v2", preprocess: "none" },
      },
      dependencies,
    );

    expect(first).toEqual(second);
    expect(reads).toEqual(["dev/input.pdf", "dev/input.pdf"]);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      itemId: "development-item",
      status: "succeeded",
      pageCount: 2,
      systemCount: 2,
    });
    expect(first.preprocess).toMatchObject({ id: "none", version: "1.0.0" });
    expect(first.items[0]!.pages[0]).toMatchObject({
      renderSha256: renderedPage(0).renderSha256,
      preprocessedSha256: renderedPage(0).renderSha256,
    });
    expect(first.summary).toEqual({
      items: { attempted: 1, succeeded: 1, failed: 0 },
      pages: { attempted: 2, succeeded: 2, failed: 0 },
      systems: 2,
      failureStages: {},
    });
    expect(fullPageSegmentationPilotReportSchema.parse(first)).toEqual(first);
  });

  it("preprocesses every page with the selected variant and records output identity", async () => {
    const input = new TextEncoder().encode("development-pdf");
    const manifest = corpusManifest(input);
    const receivedHashes: string[] = [];

    const report = await buildFullPageSegmentationPilot(
      {
        manifest,
        manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
        config: { detector: "rokot-staff-system-v2", preprocess: "adaptive-threshold-v1" },
      },
      {
        async readInput() {
          return input;
        },
        async renderPages() {
          return [gradientRenderedPage()];
        },
        segmentPage(page) {
          receivedHashes.push(page.renderSha256);
          return segmentation(page.pageIndex);
        },
      },
    );

    expect(report.schemaVersion).toBe("3.0.0");
    expect(report.preprocess).toMatchObject({ id: "adaptive-threshold-v1", version: "1.0.0" });
    expect(report.items[0]!.pages[0]).toMatchObject({
      renderSha256: gradientRenderedPage().renderSha256,
      preprocessedSha256: receivedHashes[0],
      status: "succeeded",
    });
    expect(receivedHashes[0]).not.toBe(gradientRenderedPage().renderSha256);
  });

  it("retains later page evidence after a page failure and removes machine paths from error context", async () => {
    const input = new TextEncoder().encode("development-pdf");
    const manifest = corpusManifest(input);

    const report = await buildFullPageSegmentationPilot(
      {
        manifest,
        manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
        config: { detector: "rokot-staff-system-v2", preprocess: "none" },
      },
      {
        async readInput() {
          return input;
        },
        async renderPages() {
          return [renderedPage(0), renderedPage(1)];
        },
        segmentPage(page) {
          if (page.pageIndex === 0) {
            throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "full-page segmentation failed", {
              context: {
                reason: "ambiguous-system-segmentation",
                stage: "staff-groups",
                pageIndex: 0,
                absolutePath: "/private/tmp/source.pdf",
              },
            });
          }
          return segmentation(page.pageIndex);
        },
      },
    );

    expect(report.items[0]).toMatchObject({ status: "failed", pageCount: 2, systemCount: 1 });
    expect(report.items[0]!.pages.map((page) => page.status)).toEqual(["failed", "succeeded"]);
    expect(report.summary).toEqual({
      items: { attempted: 1, succeeded: 0, failed: 1 },
      pages: { attempted: 2, succeeded: 1, failed: 1 },
      systems: 1,
      failureStages: { "staff-groups": 1 },
    });
    expect(JSON.stringify(report)).not.toContain("/private/tmp");
    expect(report.items[0]!.pages[0]).toMatchObject({
      error: {
        code: "ENGINE_OUTPUT_INVALID",
        message: "full-page segmentation failed",
        context: {
          reason: "ambiguous-system-segmentation",
          stage: "staff-groups",
          pageIndex: 0,
        },
      },
    });
  });

  it("fails before rendering when an input hash does not match the manifest", async () => {
    const expected = new TextEncoder().encode("expected");
    const actual = new TextEncoder().encode("actual");
    const manifest = corpusManifest(expected);
    let rendered = false;

    await expect(
      buildFullPageSegmentationPilot(
        {
          manifest,
          manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
          config: { detector: "rokot-staff-system-v2", preprocess: "none" },
        },
        {
          async readInput() {
            return actual;
          },
          async renderPages() {
            rendered = true;
            return [];
          },
          segmentPage,
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "corpus-input-hash-mismatch", itemId: "development-item" },
    });
    expect(rendered).toBe(false);
  });

  it("rejects unknown detector and preprocessing identities", async () => {
    const input = new TextEncoder().encode("development-pdf");
    const manifest = corpusManifest(input);

    for (const config of [
      { detector: "unknown-detector", preprocess: "none" },
      { detector: "rokot-staff-system-v2", preprocess: "deskew-v2" },
    ]) {
      await expect(
        buildFullPageSegmentationPilot(
          {
            manifest,
            manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
            config,
          },
          {
            async readInput() {
              return input;
            },
            async renderPages() {
              return [renderedPage(0)];
            },
            segmentPage,
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
  });

  it("fails the pilot when the segmentation dependency reports a different detector identity", async () => {
    const input = new TextEncoder().encode("development-pdf");
    const manifest = corpusManifest(input);

    await expect(
      buildFullPageSegmentationPilot(
        {
          manifest,
          manifestSha256: sha256Bytes(new TextEncoder().encode("manifest")),
          config: { detector: "rokot-staff-system-v2", preprocess: "none" },
        },
        {
          async readInput() {
            return input;
          },
          async renderPages() {
            return [renderedPage(0)];
          },
          segmentPage(page) {
            return { ...segmentation(page.pageIndex), detectorVersion: "unexpected-detector" as never };
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "detector-identity-mismatch" },
    });
  });
});

function corpusManifest(developmentInput: Uint8Array, holdoutInput?: Uint8Array): CorpusManifest {
  const items: CorpusManifest["items"] = [
    {
      id: "development-item",
      workId: "development-work",
      variantId: "full-work",
      split: "development",
      category: "real-scanned-full-page",
      input: { path: "dev/input.pdf", sha256: sha256Bytes(developmentInput) },
      groundTruth: {
        path: "dev/truth.musicxml",
        sha256: "1".repeat(64),
        format: "musicxml",
      },
      license: { id: "CC-BY-SA-4.0", source: "https://example.com/license" },
    },
  ];
  if (holdoutInput !== undefined) {
    items.push({
      id: "holdout-item",
      workId: "holdout-work",
      variantId: "full-work",
      split: "holdout",
      category: "real-scanned-full-page",
      input: { path: "holdout/input.pdf", sha256: sha256Bytes(holdoutInput) },
      groundTruth: {
        path: "holdout/truth.musicxml",
        sha256: "2".repeat(64),
        format: "musicxml",
      },
      license: { id: "CC-BY-SA-4.0", source: "https://example.com/license" },
    });
  }
  return { schemaVersion: "1.0.0", corpusId: "test-corpus", protocolVersion: "1.0.0", items };
}

function renderedPage(pageIndex: number): RenderedPdfPage {
  const pixels = new Uint8Array(16).fill(255 - pageIndex);
  return {
    pageIndex,
    pdfWidth: 2,
    pdfHeight: 2,
    pixelWidth: 2,
    pixelHeight: 2,
    scale: 1,
    format: "rgba",
    pixels,
    renderSha256: sha256Bytes(pixels),
  };
}

function gradientRenderedPage(): RenderedPdfPage {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const value = 60 + ((offset / 4) % 16) * 10;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return {
    pageIndex: 0,
    pdfWidth: 16,
    pdfHeight: 16,
    pixelWidth: 16,
    pixelHeight: 16,
    scale: 1,
    format: "rgba",
    pixels,
    renderSha256: sha256Bytes(pixels),
  };
}

function segmentation(pageIndex: number): StaffSystemSegmentation {
  return {
    detectorVersion: "rokot-staff-system-v2",
    parameters: {
      detectorVersion: "rokot-staff-system-v2",
      horizontalRunCoverage: 0.05,
      continuousRowCoverage: 0.5,
      minimumStaffSpacingPx: 3,
      maximumStaffSpacingPx: 40,
      spacingToleranceRatio: 0.25,
      fragmentedSpacingToleranceRatio: 0.3,
      fragmentedRunContainmentRatio: 0.9,
      minimumGrandStaffGapMultiplier: 2,
      maximumGrandStaffGapMultiplier: 10,
      minimumConnectorCoverage: 0.95,
      minimumCurvedConnectorCoverage: 0.85,
      fragmentedRowCoverage: 0.2,
      cropPaddingMultiplier: 4,
    },
    systems: [
      {
        staffLayout: "grand-staff",
        staffCount: 2,
        pageIndex,
        systemIndex: 0,
        pageRenderSha256: `${pageIndex}`.repeat(64),
        localStaffSpacingPx: 6,
        pixelBBox: { x: 0, y: 0, width: 2, height: 2 },
        pdfPointBBox: { x: 0, y: 0, width: 2, height: 2 },
        cropPixels: new Uint8Array(16).fill(255),
        cropSha256: "a".repeat(64),
        staffLineYs: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10],
      },
    ],
  };
}

function segmentPage(page: RenderedPdfPage): StaffSystemSegmentation {
  return segmentation(page.pageIndex);
}
