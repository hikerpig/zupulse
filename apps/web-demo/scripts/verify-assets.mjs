import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
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

const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const bundleFiles = (await listFiles(distRoot)).filter((file) => file.endsWith(".js"));
const sourceMaps = (await listFiles(distRoot)).filter((file) => file.endsWith(".map"));
if (sourceMaps.length > 0) throw new Error("Source maps must not ship in Browser public assets");
const bundles = await Promise.all(bundleFiles.map((file) => readFile(file, "utf8")));

if (bundles.some((bundle) => bundle.includes("file:///"))) {
  throw new Error("alphaTab must be imported from /alphatab/, not bundled from a local file URL");
}
if (
  bundles.some(
    (bundle) =>
      bundle.includes("POSTHOG_PERSONAL_API_KEY") ||
      bundle.includes("https://cdn.posthog.com") ||
      [...bundle.matchAll(/https?:\/\/[^"'\\s)]+posthog[^"'\\s)]*/gi)].some(
        ([host]) => !host.startsWith("https://us.i.posthog.com"),
      ),
  )
) {
  throw new Error("Browser public assets contain an invalid telemetry or remote-code reference");
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}
