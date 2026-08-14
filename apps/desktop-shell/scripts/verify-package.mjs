import { extractAll } from "@electron/asar";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = new URL("..", import.meta.url);
const allowPdfOmrSmoke = process.argv.includes("--allow-pdf-omr-smoke");
const expectedSampleBase64 = (
  await readFile(new URL("../../../product-assets/samples/cannon-in-d.mxl", import.meta.url))
).toString("base64");
const outRoot = new URL("./out/", shellRoot);
const asar = await findFile(outRoot, "app.asar");
if (!asar) throw new Error("Missing packaged app.asar");

const extracted = await mkdtemp(join(tmpdir(), "zupulse-package-"));
try {
  extractAll(fileURLToPath(asar), extracted);
  const required = [
    "dist/main/main.cjs",
    "dist/main/pdf.worker.mjs",
    "dist/main/pdfjs-standard-fonts/FoxitSerif.pfb",
    "dist/main/pdfjs-wasm/jbig2.wasm",
    "dist/main/pdfjs-wasm/jbig2_nowasm_fallback.js",
    "dist/preload/preload.cjs",
    "dist/renderer/index.html",
    "dist/renderer/alphatab/alphaTab.mjs",
    "dist/renderer/alphatab/alphaTab.core.mjs",
    "dist/renderer/alphatab/alphaTab.worker.mjs",
    "dist/renderer/alphatab/alphaTab.worklet.mjs",
    "dist/renderer/alphatab/font/Bravura.woff2",
    "dist/renderer/alphatab/soundfont/sonivox.sf3",
    "dist/renderer/alphatab/soundfont/LICENSE",
  ];
  for (const path of required) {
    await access(join(extracted, path)).catch(() => {
      throw new Error(`Missing packaged asset: ${path}`);
    });
  }
  const html = await readFile(join(extracted, "dist/renderer/index.html"), "utf8");
  if (!html.includes("Content-Security-Policy") || !html.includes("default-src 'none'")) {
    throw new Error("Packaged renderer is missing its CSP");
  }

  let bundledSampleFound = false;
  for (const file of await listFiles(extracted)) {
    const path = relative(extracted, file);
    if (!allowPdfOmrSmoke && path === "dist/main/pdf-omr-packaged-smoke-entry.cjs") {
      throw new Error(`Verification-only packaged file: ${path}`);
    }
    if (path.includes("test-fixtures") || extname(path) === ".map") {
      throw new Error(`Forbidden packaged file: ${path}`);
    }
    if ([".js", ".cjs", ".html"].includes(extname(path))) {
      const source = await readFile(file, "utf8");
      if (source.includes("tools/pdf-omr-cli/src/")) {
        throw new Error(`Workspace source path leaked into package: ${path}`);
      }
      if (source.includes("MockNativeBridge")) {
        throw new Error(`MockNativeBridge leaked into package: ${path}`);
      }
      if (source.includes(expectedSampleBase64)) bundledSampleFound = true;
    }
  }
  if (!bundledSampleFound) throw new Error("Packaged renderer is missing the verified bundled sample");
} finally {
  await rm(extracted, { recursive: true, force: true });
}

async function findFile(rootUrl, name) {
  const entries = await readdir(rootUrl, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, rootUrl);
    if (entry.isFile() && basename(entry.name) === name) return child;
    if (entry.isDirectory()) {
      const found = await findFile(child, name);
      if (found) return found;
    }
  }
  return undefined;
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}
