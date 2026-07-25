import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_WEB_ASSETS = [
  "index.html",
  "alphatab/alphaTab.mjs",
  "alphatab/alphaTab.core.mjs",
  "alphatab/alphaTab.worker.mjs",
  "alphatab/alphaTab.worklet.mjs",
  "alphatab/font/Bravura.woff2",
  "alphatab/soundfont/sonivox.sf3",
  "alphatab/soundfont/LICENSE",
];

const MANIFEST_FILE = "asset-manifest.json";
const MANIFEST_SCHEMA_VERSION = 1;

export async function createWebAssetManifest(root, versions) {
  await assertRequiredAssets(root);
  const paths = (await listFiles(root)).filter((path) => path !== MANIFEST_FILE).sort();
  assertEntrypointAssets(paths);
  await assertAlphaTabExternalImport(root, paths);
  const assets = await Promise.all(paths.map((path) => describeAsset(root, path)));
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    appVersion: requireVersion("appVersion", versions.appVersion),
    bridgeVersion: requireVersion("bridgeVersion", versions.bridgeVersion),
    buildHash: buildHash(assets, versions),
    assets,
  };
}

export async function verifyWebAssetManifest(root, manifest) {
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) throw new Error("Unsupported iPad asset manifest");
  const expected = await createWebAssetManifest(root, {
    appVersion: manifest.appVersion,
    bridgeVersion: manifest.bridgeVersion,
  });
  const actualByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
  if (actualByPath.size !== expected.assets.length) throw new Error("iPad web asset manifest file set mismatch");
  for (const asset of expected.assets) {
    const actual = actualByPath.get(asset.path);
    if (!actual) throw new Error(`iPad web asset manifest is missing: ${asset.path}`);
    if (actual.sha256 !== asset.sha256 || actual.sizeBytes !== asset.sizeBytes) {
      throw new Error(`iPad web asset hash mismatch: ${asset.path}`);
    }
  }
  if (manifest.buildHash !== expected.buildHash) throw new Error("iPad web build hash mismatch");
}

async function assertRequiredAssets(root) {
  for (const path of REQUIRED_WEB_ASSETS) {
    const info = await stat(join(root, path)).catch(() => undefined);
    if (!info?.isFile() || info.size === 0) throw new Error(`Missing iPad web asset: ${path}`);
  }
}

function assertEntrypointAssets(paths) {
  if (!paths.some((path) => path.startsWith("assets/") && path.endsWith(".js"))) {
    throw new Error("Missing iPad JavaScript entrypoint");
  }
  if (!paths.some((path) => path.startsWith("assets/") && path.endsWith(".css"))) {
    throw new Error("Missing iPad CSS entrypoint");
  }
}

async function assertAlphaTabExternalImport(root, paths) {
  const scripts = paths.filter((path) => path.startsWith("assets/") && path.endsWith(".js"));
  const sources = await Promise.all(scripts.map((path) => readFile(join(root, path), "utf8")));
  if (!sources.some((source) => source.includes("/alphatab/alphaTab.mjs"))) {
    throw new Error("iPad bundle must import alphaTab from /alphatab/alphaTab.mjs");
  }
  if (sources.some((source) => source.includes("file:///"))) {
    throw new Error("Local file URL leaked into iPad web bundle");
  }
}

async function describeAsset(root, path) {
  const bytes = await readFile(join(root, path));
  return { path, sizeBytes: bytes.byteLength, sha256: sha256(bytes) };
}

function buildHash(assets, versions) {
  return sha256(
    JSON.stringify({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      appVersion: requireVersion("appVersion", versions.appVersion),
      bridgeVersion: requireVersion("bridgeVersion", versions.bridgeVersion),
      assets,
    }),
  );
}

function requireVersion(name, value) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${name}`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else if (entry.isFile()) files.push(relative(root, child).split(sep).join("/"));
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const shellRoot = new URL("..", import.meta.url);
  const root = fileURLToPath(new URL("./dist/web/", shellRoot));
  const manifest = JSON.parse(await readFile(join(root, MANIFEST_FILE), "utf8"));
  await verifyWebAssetManifest(root, manifest);
}
