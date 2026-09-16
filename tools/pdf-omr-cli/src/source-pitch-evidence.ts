import { open } from "node:fs/promises";
import { join } from "node:path";
import { sha256Bytes } from "./canonical-json";
import { omrRunManifestSchema, sha256Schema } from "./schemas";

export async function readSourcePitchEvidence(directory: string, inputSha256: string) {
  sha256Schema.parse(inputSha256);
  // Base64 plus the result envelope must fit the object store's 64 MiB readback limit.
  let remaining = 32 * 1024 * 1024;
  const read = async (name: string, limit = remaining) => {
    const handle = await open(join(directory, name), "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > Math.min(limit, remaining)) throw new Error("pitch-evidence-size");
      const bytes = await handle.readFile();
      if (bytes.byteLength !== stat.size) throw new Error("pitch-evidence-changed");
      remaining -= bytes.byteLength;
      return bytes;
    } finally {
      await handle.close();
    }
  };
  const manifestBytes = await read("run.json", 1024 * 1024);
  const manifest = omrRunManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.inputSha256 !== inputSha256 || manifest.engine.id !== "legato" || manifest.status !== "succeeded") {
    throw new Error("pitch-evidence-identity");
  }
  if (manifest.parameters.pitchCorrection === undefined) return undefined;
  const files = [{ name: "run.json", sha256: sha256Bytes(manifestBytes), base64: manifestBytes.toString("base64") }];
  // Never traverse arbitrary paths from a manifest; retain only the fixed correction evidence contract.
  const names = ["raw-draft.json", "draft.json", "pitch-correction/report.json", "engine/converted.musicxml"];
  if (manifest.artifactSha256["pitch-correction/source.json"] !== undefined) names.push("pitch-correction/source.json");
  for (const name of names) {
    const bytes = await read(name);
    const sha256 = sha256Bytes(bytes);
    if (sha256 !== manifest.artifactSha256[name]) throw new Error("pitch-evidence-hash");
    files.push({ name, sha256, base64: bytes.toString("base64") });
  }
  return { schemaVersion: "1.0.0", inputSha256, files };
}
