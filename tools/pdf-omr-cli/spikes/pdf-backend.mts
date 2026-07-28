import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getDocument, OPS, PasswordResponses } from "pdfjs-dist/legacy/build/pdf.mjs";
import { sha256Bytes } from "../src/canonical-json";

const rasterOperators = new Set<number>([
  OPS.paintImageMaskXObject,
  OPS.paintSolidColorImageMask,
  OPS.paintInlineImageXObject,
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat,
]);
const vectorOperators = new Set<number>([OPS.constructPath, OPS.showText, OPS.showSpacedText]);

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("usage: pdf-backend.mts <pdf>...");

const results = [];
for (const input of paths) {
  const bytes = new Uint8Array(await readFile(resolve(input)));
  const inputSha256 = sha256Bytes(bytes);
  try {
    const loadingTask = getDocument({ data: bytes });
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const operators = await page.getOperatorList();
    const raster = operators.fnArray.filter((operator) => rasterOperators.has(operator)).length;
    const vector = operators.fnArray.filter((operator) => vectorOperators.has(operator)).length;
    const viewport = page.getViewport({ scale: 0.25 });
    const canvas = document.canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: canvas.context, viewport }).promise;
    const png = canvas.canvas.toBuffer("image/png");
    results.push({
      file: basename(input),
      sha256: inputSha256,
      pages: document.numPages,
      firstPage: {
        width: viewport.width * 4,
        height: viewport.height * 4,
        rasterOperators: raster,
        vectorOperators: vector,
        renderedPngBytes: png.byteLength,
        renderedPngSha256: sha256Bytes(png),
      },
    });
    page.cleanup();
    await loadingTask.destroy();
  } catch (error) {
    const candidate = error as { name?: string; code?: number; message?: string };
    results.push({
      file: basename(input),
      sha256: inputSha256,
      error: {
        name: candidate.name ?? "UnknownError",
        ...(candidate.code === undefined
          ? {}
          : {
              code:
                candidate.code === PasswordResponses.NEED_PASSWORD
                  ? "NEED_PASSWORD"
                  : candidate.code === PasswordResponses.INCORRECT_PASSWORD
                    ? "INCORRECT_PASSWORD"
                    : candidate.code,
            }),
        message: candidate.message ?? String(error),
      },
    });
  }
}

console.log(JSON.stringify(results, null, 2));
