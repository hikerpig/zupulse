import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifySampleScores(root = resolve("product-assets/samples")) {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    throw new Error("SAMPLE_MANIFEST_INVALID");
  }
  const ids = new Set();
  for (const sample of manifest.samples) {
    for (const field of ["id", "title", "fileName", "format", "attribution", "license", "sha256"]) {
      if (typeof sample[field] !== "string" || sample[field].trim() === "") {
        throw new Error(`SAMPLE_FIELD_MISSING:${field}`);
      }
    }
    if (ids.has(sample.id)) throw new Error(`SAMPLE_ID_DUPLICATE:${sample.id}`);
    ids.add(sample.id);
    if (!/^[a-f0-9]{64}$/.test(sample.sha256)) throw new Error(`SAMPLE_HASH_INVALID:${sample.id}`);
    const bytes = await readFile(resolve(root, sample.fileName));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== sample.sha256) throw new Error(`SAMPLE_HASH_MISMATCH:${sample.id}`);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await verifySampleScores();
  console.log(`Verified ${manifest.samples.length} sample score asset.`);
}
