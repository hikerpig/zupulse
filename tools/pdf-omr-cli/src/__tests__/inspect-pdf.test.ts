import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { inspectOmrInputBytes, inspectPdfBytes, mapPdfLoadError } from "../inspect-pdf";

describe("PDF inspection", () => {
  it("reports deterministic page and vector/raster signals", async () => {
    const bytes = minimalPdf("0 0 m 100 100 l S");

    const first = await inspectPdfBytes(bytes, { fileName: "/private/input/vector.pdf" });
    const second = await inspectPdfBytes(bytes, { fileName: "/another/location/vector.pdf" });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: "1.0.0",
      command: "inspect",
      source: {
        fileName: "vector.pdf",
        sizeBytes: bytes.byteLength,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      pageCount: 1,
      pages: [
        {
          index: 0,
          width: 200,
          height: 200,
          vectorOperators: expect.any(Number),
          rasterOperators: 0,
        },
      ],
    });
    expect(first.pages[0]!.vectorOperators).toBeGreaterThan(0);
  });

  it("maps malformed and password-protected inputs to stable reasons", async () => {
    await expect(
      inspectPdfBytes(new TextEncoder().encode("%PDF-1.7\nnot a document"), { fileName: "broken.pdf" }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "malformed-pdf", fileName: "broken.pdf" },
    });
    expect(() => mapPdfLoadError({ name: "PasswordException", code: 1, message: "password" }, "protected.pdf")).toThrow(
      expect.objectContaining({
        code: "INVALID_INPUT",
        context: { reason: "encrypted-pdf", fileName: "protected.pdf" },
      }),
    );
  });

  it("writes inspect output without exposing the absolute input path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-inspect-"));
    const inputPath = join(directory, "score.pdf");
    const outputPath = join(directory, "run");
    await writeFile(inputPath, minimalPdf("0 0 m 100 100 l S"));

    const report = await runPdfOmrCommand(["inspect", inputPath, "--output", outputPath]);

    expect(report).toMatchObject({ command: "inspect", source: { fileName: "score.pdf" } });
    const artifact = await readFile(join(outputPath, "input.json"), "utf8");
    expect(artifact).not.toContain(directory);
  });

  it("inspects PNG and JPEG as single-page raster inputs", async () => {
    const png = await inspectOmrInputBytes(minimalPng(640, 480), { fileName: "/private/input/score.png" });
    const jpeg = await inspectOmrInputBytes(minimalJpeg(1200, 900), { fileName: "/private/input/score.jpg" });

    expect(png).toMatchObject({
      source: { fileName: "score.png" },
      pageCount: 1,
      pages: [{ index: 0, width: 640, height: 480, vectorOperators: 0, rasterOperators: 1 }],
    });
    expect(jpeg).toMatchObject({
      source: { fileName: "score.jpg" },
      pageCount: 1,
      pages: [{ index: 0, width: 1200, height: 900, vectorOperators: 0, rasterOperators: 1 }],
    });
  });

  it("rejects an image extension whose bytes are not a supported image", async () => {
    await expect(
      inspectOmrInputBytes(new TextEncoder().encode("not-an-image"), { fileName: "score.png" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", context: { reason: "malformed-image", fileName: "score.png" } });
  });
});

function minimalPng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function minimalJpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function minimalPdf(content: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n`;
  source += "0000000000 65535 f \n";
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}
