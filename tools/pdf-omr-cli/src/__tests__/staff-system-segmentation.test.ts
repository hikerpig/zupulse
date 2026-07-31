import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPdfPages, type RenderedPdfPage } from "../render-pdf-pages";
import { GRAND_STAFF_SEGMENTATION_PARAMETERS, segmentGrandStaffSystems } from "../staff-system-segmentation";

describe("segmentGrandStaffSystems", () => {
  it("detects noisy grand staffs, sorts systems, maps coordinates, and is deterministic", () => {
    const pageOne = page(1, 200, 260, [30, 36, 42, 48, 54, 78, 84, 90, 96, 102]);
    const pageZero = page(
      0,
      200,
      260,
      [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 140, 146, 152, 158, 164, 188, 194, 200, 206, 212],
    );
    setBlack(pageZero, 3, 110);
    setBlack(pageZero, 150, 117);

    const first = segmentGrandStaffSystems([pageOne, pageZero]);
    const second = segmentGrandStaffSystems([pageOne, pageZero]);

    expect(first).toEqual(second);
    expect(first.detectorVersion).toBe("rokot-grand-staff-v1");
    expect(first.parameters).toEqual(GRAND_STAFF_SEGMENTATION_PARAMETERS);
    expect(first.systems.map((system) => [system.pageIndex, system.systemIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(first.systems[0]).toMatchObject({
      pageIndex: 0,
      pageRenderSha256: "render-0",
      localStaffSpacingPx: 6,
      pixelBBox: { x: 0, y: 0, width: 200, height: 116 },
      pdfPointBBox: { x: 0, y: 144, width: 200, height: 116 },
      cropSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      staffLineYs: [20, 26, 32, 38, 44, 68, 74, 80, 86, 92],
    });
    expect(first.systems[0]!.cropPixels).toHaveLength(200 * 116 * 4);
  });

  it("caps padding at deterministic boundaries so neighboring crops never overlap", () => {
    const input = page(
      0,
      200,
      230,
      [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 120, 126, 132, 138, 144, 168, 174, 180, 186, 192],
    );

    const result = segmentGrandStaffSystems([input]);

    expect(result.systems).toHaveLength(2);
    const upper = result.systems[0]!.pixelBBox;
    const lower = result.systems[1]!.pixelBBox;
    expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y);
    expect(upper.y + upper.height).toBe(106);
    expect(lower.y).toBe(106);
  });

  it("detects a short final system without requiring page-width staff lines", () => {
    const input = page(0, 200, 160, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92], 40);

    const result = segmentGrandStaffSystems([input]);

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([20, 26, 32, 38, 44, 68, 74, 80, 86, 92]);
  });

  it("segments every grand staff in the repository K331 development fixture", async () => {
    const fixture = fileURLToPath(new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.pdf", import.meta.url));
    const pages = await renderPdfPages(await readFile(fixture));

    const result = segmentGrandStaffSystems(pages);

    expect(pages.map((page) => result.systems.filter((system) => system.pageIndex === page.pageIndex).length)).toEqual([
      6, 6, 1, 6, 6, 2,
    ]);
    expect(result.systems).toHaveLength(27);
    expect(result.systems.filter((system) => system.pageIndex === 5).map((system) => system.systemIndex)).toEqual([
      0, 1,
    ]);
  });

  it("rejects missing staff lines, ambiguous pairings, and zero systems before inference", () => {
    const missingLine = page(0, 200, 160, [20, 26, 32, 38, 68, 74, 80, 86, 92]);
    const ambiguousPairing = page(0, 200, 180, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 116, 122, 128, 134, 140]);
    const empty = page(0, 200, 160, []);

    for (const input of [missingLine, ambiguousPairing, empty]) {
      expect(() => segmentGrandStaffSystems([input])).toThrow(
        expect.objectContaining({
          code: "ENGINE_OUTPUT_INVALID",
          context: expect.objectContaining({ reason: "ambiguous-system-segmentation", pageIndex: 0 }),
        }),
      );
    }
  });
});

function page(
  pageIndex: number,
  width: number,
  height: number,
  lineYs: readonly number[],
  lineEnd = width - 10,
): RenderedPdfPage {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  const result: RenderedPdfPage = {
    pageIndex,
    pdfWidth: width,
    pdfHeight: height,
    pixelWidth: width,
    pixelHeight: height,
    scale: 1,
    format: "rgba",
    pixels,
    renderSha256: `render-${pageIndex}`,
  };
  for (const y of lineYs) {
    for (let x = 10; x < lineEnd; x += 1) setBlack(result, x, y);
  }
  for (let index = 0; index + 9 < lineYs.length; index += 10) {
    for (let y = lineYs[index]!; y <= lineYs[index + 9]!; y += 1) setBlack(result, 10, y);
  }
  return result;
}

function setBlack(page: RenderedPdfPage, x: number, y: number): void {
  const offset = (y * page.pixelWidth + x) * 4;
  page.pixels[offset] = 0;
  page.pixels[offset + 1] = 0;
  page.pixels[offset + 2] = 0;
  page.pixels[offset + 3] = 255;
}
