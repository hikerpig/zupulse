import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { REQUIRED_WEB_ASSETS, createWebAssetManifest, verifyWebAssetManifest } from "../verify-web-assets.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("iPad web asset manifest", () => {
  it("records deterministic hashes and verifies the complete playback bundle", async () => {
    const root = await createFixture();
    const manifest = await createWebAssetManifest(root, { appVersion: "0.1.0", bridgeVersion: "3.0.0" });

    expect(manifest.buildHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.assets.map((asset) => asset.path)).toEqual([...manifest.assets.map((asset) => asset.path)].sort());
    await expect(createWebAssetManifest(root, { appVersion: "0.1.0", bridgeVersion: "3.0.0" })).resolves.toEqual(
      manifest,
    );
    await expect(verifyWebAssetManifest(root, manifest)).resolves.toBeUndefined();
  });

  it("rejects a missing required playback asset", async () => {
    const root = await createFixture({ omit: "alphatab/alphaTab.worklet.mjs" });

    await expect(createWebAssetManifest(root, { appVersion: "0.1.0", bridgeVersion: "3.0.0" })).rejects.toThrow(
      "Missing iPad web asset: alphatab/alphaTab.worklet.mjs",
    );
  });

  it("rejects bytes that no longer match the generated manifest", async () => {
    const root = await createFixture();
    const manifest = await createWebAssetManifest(root, { appVersion: "0.1.0", bridgeVersion: "3.0.0" });
    await writeFile(join(root, "index.html"), "tampered", "utf8");

    await expect(verifyWebAssetManifest(root, manifest)).rejects.toThrow("iPad web asset hash mismatch: index.html");
  });
});

async function createFixture(options: { omit?: string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-ipad-assets-"));
  temporaryRoots.push(root);
  const files = [...REQUIRED_WEB_ASSETS, "assets/main.123.js", "assets/main.123.css"];
  for (const path of files) {
    if (path === options.omit) continue;
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, path === "assets/main.123.js" ? 'import "/alphatab/alphaTab.mjs";' : path, "utf8");
  }
  return root;
}
