import { describe, expect, it } from "vitest";
import { renderPdfPages } from "../render-pdf-pages";

describe("renderPdfPages", () => {
  it("renders ordered 1400px opaque RGBA pages deterministically", async () => {
    const bytes = pdf([
      { width: 200, height: 240, content: "0 0 0 RG 10 100 m 190 100 l S" },
      { width: 200, height: 240, content: "0 0 0 RG 10 200 m 190 200 l S" },
    ]);

    const first = await renderPdfPages(bytes);
    const second = await renderPdfPages(bytes);

    expect(first).toHaveLength(2);
    expect(first.map(({ pixels: _pixels, ...page }) => page)).toEqual(
      second.map(({ pixels: _pixels, ...page }) => page),
    );
    expect(first.map((page) => page.pageIndex)).toEqual([0, 1]);
    expect(first[0]).toMatchObject({
      pageIndex: 0,
      pdfWidth: 200,
      pdfHeight: 240,
      pixelWidth: 1400,
      pixelHeight: 1680,
      scale: 7,
      format: "rgba",
      renderSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first[0]!.renderSha256).toBe(second[0]!.renderSha256);
    expect(first[0]!.pixels).toHaveLength(1400 * 1680 * 4);
    expect(first[0]!.pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  });

  it("maps malformed, empty, and landscape PDFs to stable structured errors", async () => {
    await expect(renderPdfPages(new TextEncoder().encode("%PDF-1.7\nbroken"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "malformed-pdf" },
    });
    await expect(renderPdfPages(pdf([]))).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason: "zero-page-pdf" },
    });
    await expect(renderPdfPages(pdf([{ width: 400, height: 200, content: "" }]))).rejects.toMatchObject({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason: "unsupported-page-orientation", pageIndex: 0 },
    });
  });

  it("allows landscape source pages only when the caller explicitly opts in", async () => {
    const pages = await renderPdfPages(pdf([{ width: 400, height: 200, content: "" }]), { allowLandscape: true });

    expect(pages[0]).toMatchObject({ pdfWidth: 400, pdfHeight: 200, pixelWidth: 1400, pixelHeight: 700 });
  });
});

function pdf(pages: readonly { width: number; height: number; content: string }[]): Uint8Array {
  const pageIds = pages.map((_, index) => index + 3);
  const contentIds = pages.map((_, index) => pages.length + index + 3);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pages.map(
      (page, index) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << >> /Contents ${contentIds[index]} 0 R >>`,
    ),
    ...pages.map((page) => `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`),
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}
