import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWebAssetManifest, verifyWebAssetManifest } from "./verify-web-assets.mjs";

const shellRoot = new URL("..", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);
const outputRoot = fileURLToPath(new URL("./dist/web/", shellRoot));

execFileSync("pnpm", ["--filter", "@zupulse/ipad-shell", "web:build"], {
  cwd: fileURLToPath(repositoryRoot),
  stdio: "inherit",
});

const packageJson = JSON.parse(await readFile(new URL("./package.json", shellRoot), "utf8"));
const bridgeSource = await readFile(new URL("../../packages/web-core/src/bridge/schemas.ts", shellRoot), "utf8");
const bridgeVersion = bridgeSource.match(/BRIDGE_SCHEMA_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!bridgeVersion) throw new Error("Unable to read BRIDGE_SCHEMA_VERSION");

const manifest = await createWebAssetManifest(outputRoot, {
  appVersion: packageJson.version,
  bridgeVersion,
});
await writeFile(join(outputRoot, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await verifyWebAssetManifest(outputRoot, manifest);
