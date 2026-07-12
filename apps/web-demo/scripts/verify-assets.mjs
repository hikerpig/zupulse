import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const requiredAssets = [
  "../dist/alphatab/alphaTab.mjs",
  "../dist/alphatab/alphaTab.core.mjs",
  "../dist/alphatab/alphaTab.worker.mjs",
  "../dist/alphatab/alphaTab.worklet.mjs",
  "../dist/alphatab/font/Bravura.woff2",
  "../dist/alphatab/soundfont/sonivox.sf3",
  "../dist/alphatab/soundfont/LICENSE",
];

for (const relativePath of requiredAssets) {
  try {
    const info = await stat(fileURLToPath(new URL(relativePath, import.meta.url)));
    if (!info.isFile() || info.size === 0) throw new Error("empty");
  } catch {
    throw new Error(`Missing playback asset: ${relativePath.replace("../dist/", "")}`);
  }
}

const bundleFiles = (await readdir(fileURLToPath(new URL("../dist/", import.meta.url)))).filter((file) => file.endsWith(".js"));
const bundles = await Promise.all(
  bundleFiles.map((file) => readFile(fileURLToPath(new URL(`../dist/${file}`, import.meta.url)), "utf8")),
);

if (bundles.some((bundle) => bundle.includes("file:///"))) {
  throw new Error("alphaTab must be imported from /alphatab/, not bundled from a local file URL");
}
