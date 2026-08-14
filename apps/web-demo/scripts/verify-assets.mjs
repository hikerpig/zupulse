import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const requiredAssets = [
  "../dist/alphatab/alphaTab.mjs",
  "../dist/alphatab/alphaTab.core.mjs",
  "../dist/alphatab/alphaTab.worker.mjs",
  "../dist/alphatab/alphaTab.worklet.mjs",
  "../dist/alphatab/font/Bravura.woff2",
  "../dist/alphatab/soundfont/sonivox.sf3",
  "../dist/alphatab/soundfont/LICENSE",
  "../dist/samples/cannon-in-d.mxl",
  "../dist/samples/manifest.json",
  "../dist/samples/LICENSE.md",
];

for (const relativePath of requiredAssets) {
  try {
    const info = await stat(fileURLToPath(new URL(relativePath, import.meta.url)));
    if (!info.isFile() || info.size === 0) throw new Error("empty");
  } catch {
    throw new Error(`Missing playback asset: ${relativePath.replace("../dist/", "")}`);
  }
}

const sampleManifest = JSON.parse(
  await readFile(fileURLToPath(new URL("../dist/samples/manifest.json", import.meta.url)), "utf8"),
);
for (const sample of sampleManifest.samples) {
  const bytes = await readFile(fileURLToPath(new URL(`../dist/samples/${sample.fileName}`, import.meta.url)));
  if (createHash("sha256").update(bytes).digest("hex") !== sample.sha256) {
    throw new Error(`Bundled sample hash mismatch: ${sample.id}`);
  }
}

const bundleFiles = (await readdir(fileURLToPath(new URL("../dist/", import.meta.url)))).filter((file) =>
  file.endsWith(".js"),
);
if (
  (await readdir(fileURLToPath(new URL("../dist/", import.meta.url)))).some((file) => file.endsWith(".map")) &&
  process.env.TELEMETRY_SOURCE_MAPS !== "1"
) {
  throw new Error("Source maps must not ship in Browser public assets");
}
const bundles = await Promise.all(
  bundleFiles.map((file) => readFile(fileURLToPath(new URL(`../dist/${file}`, import.meta.url)), "utf8")),
);

if (bundles.some((bundle) => bundle.includes("file:///"))) {
  throw new Error("alphaTab must be imported from /alphatab/, not bundled from a local file URL");
}
