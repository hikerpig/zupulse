import { zlibSync } from "fflate";

export type RgbaPdfPage = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

export function encodeRgbaPagesAsPdf(pages: readonly RgbaPdfPage[]): Uint8Array {
  if (pages.length === 0) throw new TypeError("raster PDF requires at least one page");
  const pageObjects = pages.map((page, index) => encodePageObjects(page, 3 + index * 3));
  const objectBodies = [
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii(
      `<< /Type /Pages /Kids [${pageObjects.map((page) => `${page.pageObjectId} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
    ...pageObjects.flatMap((page) => page.bodies),
  ];
  const chunks: Uint8Array[] = [Uint8Array.from([...ascii("%PDF-1.4\n%"), 0xff, 0xff, 0xff, 0xff, 0x0a])];
  const offsets = [0];
  let byteLength = chunks[0]!.byteLength;
  for (const [index, body] of objectBodies.entries()) {
    const objectId = index + 1;
    const object = concatenate([ascii(`${objectId} 0 obj\n`), body, ascii("\nendobj\n")]);
    offsets[objectId] = byteLength;
    chunks.push(object);
    byteLength += object.byteLength;
  }
  const xrefOffset = byteLength;
  const xref = ascii(
    `xref\n0 ${objectBodies.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  chunks.push(xref);
  return concatenate(chunks);
}

function encodePageObjects(page: RgbaPdfPage, pageObjectId: number) {
  validatePage(page);
  const imageObjectId = pageObjectId + 1;
  const contentObjectId = pageObjectId + 2;
  const image = zlibSync(compositeRgb(page.pixels), { level: 9 });
  const content = ascii(`q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ\n`);
  return {
    pageObjectId,
    bodies: [
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      ),
      stream(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.byteLength} >>`,
        image,
      ),
      stream(`<< /Length ${content.byteLength} >>`, content),
    ],
  };
}

function validatePage(page: RgbaPdfPage): void {
  if (!Number.isSafeInteger(page.width) || page.width <= 0 || !Number.isSafeInteger(page.height) || page.height <= 0) {
    throw new TypeError("raster PDF dimensions must be positive integers");
  }
  if (page.pixels.byteLength !== page.width * page.height * 4) {
    throw new TypeError("raster PDF pixels must contain complete RGBA rows");
  }
}

function compositeRgb(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.byteLength / 4) * 3);
  for (let source = 0, target = 0; source < rgba.byteLength; source += 4, target += 3) {
    const alpha = rgba[source + 3]!;
    rgb[target] = compositeChannel(rgba[source]!, alpha);
    rgb[target + 1] = compositeChannel(rgba[source + 1]!, alpha);
    rgb[target + 2] = compositeChannel(rgba[source + 2]!, alpha);
  }
  return rgb;
}

function compositeChannel(channel: number, alpha: number): number {
  return Math.round((channel * alpha + 255 * (255 - alpha)) / 255);
}

function stream(dictionary: string, bytes: Uint8Array): Uint8Array {
  return concatenate([ascii(`${dictionary}\nstream\n`), bytes, ascii("\nendstream")]);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
