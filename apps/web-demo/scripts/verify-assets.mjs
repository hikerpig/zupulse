import { stat } from "node:fs/promises";
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
