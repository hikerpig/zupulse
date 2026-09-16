import { mkdtemp, mkdir, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import { readSourcePitchEvidence } from "../source-pitch-evidence";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.map((p) => rm(p, { recursive: true, force: true })));
  directories.length = 0;
});
const inputSha256 = "a".repeat(64);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "source-pitch-evidence-"));
  directories.push(directory);
  const artifacts: Record<string, string> = {};
  for (const name of [
    "raw-draft.json",
    "draft.json",
    "pitch-correction/report.json",
    "pitch-correction/source.json",
    "engine/converted.musicxml",
  ]) {
    const bytes = Buffer.from(name.endsWith("musicxml") ? "<score-partwise/>" : "{}");
    await mkdir(join(directory, name, ".."), { recursive: true });
    await writeFile(join(directory, name), bytes);
    artifacts[name] = sha256Bytes(bytes);
  }
  const manifest = {
    schemaVersion: "1.0.0",
    runId: "test",
    inputSha256,
    engine: { id: "legato", version: "test" },
    parameters: { pitchCorrection: "legato-source-pitch-shadow-v2" },
    preprocess: { id: "none", version: "1.0.0" },
    startedAt: "2026-09-16T00:00:00.000Z",
    completedAt: "2026-09-16T00:00:01.000Z",
    status: "succeeded",
    artifactSha256: artifacts,
  };
  await writeFile(join(directory, "run.json"), JSON.stringify(manifest));
  return { directory, manifest };
}

describe("durable source pitch evidence", () => {
  it("preserves exact bytes and hashes of original, corrected and source artifacts", async () => {
    const { directory } = await fixture();
    const evidence = await readSourcePitchEvidence(directory, inputSha256);
    expect(evidence?.files.map((f) => f.name)).toEqual([
      "run.json",
      "raw-draft.json",
      "draft.json",
      "pitch-correction/report.json",
      "engine/converted.musicxml",
      "pitch-correction/source.json",
    ]);
    for (const file of evidence!.files) {
      const bytes = Buffer.from(file.base64, "base64");
      expect(bytes).toEqual(await readFile(join(directory, file.name)));
      expect(sha256Bytes(bytes)).toBe(file.sha256);
    }
    expect(JSON.stringify(evidence)).not.toContain(directory);
  });

  it.each(["hash", "identity", "missing"])("refuses incomplete or unbound evidence: %s", async (kind) => {
    const { directory, manifest } = await fixture();
    if (kind === "hash") await writeFile(join(directory, "raw-draft.json"), "changed");
    if (kind === "identity") manifest.inputSha256 = "b".repeat(64);
    if (kind === "missing") delete manifest.artifactSha256["raw-draft.json"];
    await writeFile(join(directory, "run.json"), JSON.stringify(manifest));
    await expect(readSourcePitchEvidence(directory, inputSha256)).rejects.toThrow();
  });

  it("does not add evidence to an uncorrected run", async () => {
    const { directory, manifest } = await fixture();
    await writeFile(join(directory, "run.json"), JSON.stringify({ ...manifest, parameters: {} }));
    expect(await readSourcePitchEvidence(directory, inputSha256)).toBeUndefined();
  });

  it("retains the failure report when source extraction had no source artifact", async () => {
    const { directory, manifest } = await fixture();
    delete manifest.artifactSha256["pitch-correction/source.json"];
    await writeFile(join(directory, "run.json"), JSON.stringify(manifest));
    expect((await readSourcePitchEvidence(directory, inputSha256))?.files).toHaveLength(5);
  });

  it("rejects oversized evidence before loading it into memory", async () => {
    const { directory } = await fixture();
    await truncate(join(directory, "raw-draft.json"), 32 * 1024 * 1024 + 1);
    await expect(readSourcePitchEvidence(directory, inputSha256)).rejects.toThrow("pitch-evidence-size");
  });

  it("does not follow additional paths in an untrusted manifest", async () => {
    const { directory, manifest } = await fixture();
    manifest.artifactSha256["../../private-file"] = "a".repeat(64);
    await writeFile(join(directory, "run.json"), JSON.stringify(manifest));
    expect((await readSourcePitchEvidence(directory, inputSha256))?.files).toHaveLength(6);
  });
});
