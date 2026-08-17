import { describe, expect, it } from "vitest";
import { encodeRgbaPagesAsPdf } from "../raster-pdf";
import { renderPdfPages } from "../render-pdf-pages";

describe("encodeRgbaPagesAsPdf", () => {
  it("writes deterministic multi-page PDFs that retain raster dimensions", async () => {
    const pages = [
      { width: 2, height: 3, pixels: solidRgba(2, 3, [255, 0, 0, 255]) },
      { width: 4, height: 2, pixels: solidRgba(4, 2, [0, 0, 255, 255]) },
    ];

    const first = encodeRgbaPagesAsPdf(pages);
    const second = encodeRgbaPagesAsPdf(pages);
    const rendered = await renderPdfPages(first, { targetWidth: 40, allowLandscape: true });

    expect(first).toEqual(second);
    expect(rendered).toHaveLength(2);
    expect(rendered.map((page) => [page.pdfWidth, page.pdfHeight])).toEqual([
      [2, 3],
      [4, 2],
    ]);
  });

  it("composites transparent input pixels onto white", async () => {
    const bytes = encodeRgbaPagesAsPdf([{ width: 1, height: 1, pixels: Uint8Array.from([0, 0, 0, 0]) }]);

    const [page] = await renderPdfPages(bytes, { targetWidth: 1 });

    expect([...page!.pixels]).toEqual([255, 255, 255, 255]);
  });
});

function solidRgba(width: number, height: number, rgba: readonly number[]): Uint8Array {
  return Uint8Array.from(Array.from({ length: width * height }, () => rgba).flat());
}
