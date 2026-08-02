import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySampleScores } from "../verify-sample-scores.mjs";

describe("verifySampleScores", () => {
  it("accepts the release manifest and rejects hash drift", async () => {
    await expect(verifySampleScores()).resolves.toBeTruthy();
    const temporaryRoot = await mkdtemp(join(tmpdir(), "zupulse-samples-"));
    const sourceRoot = resolve("product-assets/samples");
    await writeFile(join(temporaryRoot, "cannon-in-d.mxl"), await readFile(resolve(sourceRoot, "cannon-in-d.mxl")));
    const manifest = JSON.parse(await readFile(resolve(sourceRoot, "manifest.json"), "utf8"));
    manifest.samples[0].sha256 = "0".repeat(64);
    await writeFile(join(temporaryRoot, "manifest.json"), JSON.stringify(manifest));

    await expect(verifySampleScores(temporaryRoot)).rejects.toThrow("SAMPLE_HASH_MISMATCH:cannon-in-d");
  });
});
