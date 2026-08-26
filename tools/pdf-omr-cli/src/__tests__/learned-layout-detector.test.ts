import { describe, expect, it } from "vitest";
import type { RenderedPdfPage } from "../render-pdf-pages";
import { materializeLearnedLayoutPage } from "../learned-layout-detector";

describe("materializeLearnedLayoutPage", () => {
  it("validates ordered mixed-staff systems and materializes deterministic non-overlapping crops", () => {
    const input = page(0, 1400, 100);
    const output = {
      schemaVersion: "1.0.0",
      pageIndex: 0,
      systems: [
        system(0, 0.1, 0.3, [0.14, 0.15, 0.16, 0.17, 0.18, 0.24, 0.25, 0.26, 0.27, 0.28]),
        system(0, 0.55, 0.3, [0.59, 0.6, 0.61, 0.62, 0.63, 0.69, 0.7, 0.71, 0.72, 0.73, 0.78, 0.79, 0.8, 0.81, 0.82]),
      ],
    } as const;

    const first = materializeLearnedLayoutPage(input, output);
    const second = materializeLearnedLayoutPage(input, output);

    expect(first).toEqual(second);
    expect(first.systems.map((candidate) => [candidate.systemIndex, candidate.staffCount])).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(first.systems[0]).toMatchObject({
      pageIndex: 0,
      pageRenderSha256: "render-0",
      localStaffSpacingPx: 1,
      pixelBBox: { x: 0, y: 6, width: 1400, height: 38 },
      staffLineYs: [14, 15, 16, 17, 18, 24, 25, 26, 27, 28],
      cropSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.systems[0]!.pixelBBox.y + first.systems[0]!.pixelBBox.height).toBeLessThanOrEqual(
      first.systems[1]!.pixelBBox.y,
    );
    expect(first.systems[0]!.cropPixels).toHaveLength(1400 * 38 * 4);
  });

  it("fails closed when systems are out of order or overlap", () => {
    const input = page(0, 1400, 100);
    const output = {
      schemaVersion: "1.0.0",
      pageIndex: 0,
      systems: [
        system(0, 0.5, 0.3, [0.54, 0.55, 0.56, 0.57, 0.58]),
        system(0, 0.4, 0.3, [0.44, 0.45, 0.46, 0.47, 0.48]),
      ],
    } as const;

    expect(() => materializeLearnedLayoutPage(input, output)).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: expect.objectContaining({ stage: "learned-system-order", pageIndex: 0 }),
      }),
    );
  });

  it("fails closed when staff topology disagrees with staffCount", () => {
    const input = page(0, 1400, 100);
    const output = {
      schemaVersion: "1.0.0",
      pageIndex: 0,
      systems: [system(0, 0.1, 0.3, [0.14, 0.15, 0.16, 0.17, 0.18])],
    };
    output.systems[0]!.staffCount = 2;

    expect(() => materializeLearnedLayoutPage(input, output)).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: expect.objectContaining({ stage: "learned-staff-topology", pageIndex: 0, systemIndex: 0 }),
      }),
    );
  });

  it("fails closed when a staff-line point escapes its system bbox", () => {
    const input = page(0, 1400, 100);
    const output = {
      schemaVersion: "1.0.0",
      pageIndex: 0,
      systems: [system(0, 0.1, 0.3, [0.14, 0.15, 0.16, 0.17, 0.18])],
    };
    output.systems[0]!.staffLinePolylines[0]![0]!.y = 0.05;

    expect(() => materializeLearnedLayoutPage(input, output)).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: expect.objectContaining({ stage: "learned-staff-line-bounds", pageIndex: 0, systemIndex: 0 }),
      }),
    );
  });
});

function page(pageIndex: number, pixelWidth: number, pixelHeight: number): RenderedPdfPage {
  const pixels = new Uint8Array(pixelWidth * pixelHeight * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([255, 255, 255, 255], offset);
  }
  return {
    pageIndex,
    pdfWidth: pixelWidth / 2,
    pdfHeight: pixelHeight / 2,
    pixelWidth,
    pixelHeight,
    scale: 2,
    format: "rgba",
    pixels,
    renderSha256: `render-${pageIndex}`,
  };
}

function system(pageIndex: number, y: number, height: number, lineYs: readonly number[]) {
  return {
    pageIndex,
    confidence: 0.9,
    normalizedBBox: { x: 0.1, y, width: 0.8, height },
    staffCount: lineYs.length / 5,
    staffLinePolylines: lineYs.map((lineY) => [
      { x: 0.1, y: lineY },
      { x: 0.9, y: lineY },
    ]),
  };
}
