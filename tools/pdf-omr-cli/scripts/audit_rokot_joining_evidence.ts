import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { rokotJoiningEvidenceSchema, summarizeRokotJoiningEvidence } from "../src/benchmark/rokot-joining-evidence";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";

const runDirectory = process.argv[2];
const outputPath = process.argv[3];
if (runDirectory === undefined || outputPath === undefined) {
  throw new Error("usage: vite-node audit_rokot_joining_evidence.ts <rokot-run-directory> <new-output.json>");
}

const absoluteRunDirectory = resolve(runDirectory);
const reportBytes = await readFile(join(absoluteRunDirectory, "report.json"));
const itemDirectories = (await readdir(join(absoluteRunDirectory, "items"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const artifacts: Array<{ itemId: string; sha256: string; evidence: unknown }> = [];
for (const itemId of itemDirectories) {
  try {
    const bytes = await readFile(join(absoluteRunDirectory, "items", itemId, "joining.json"));
    artifacts.push({
      itemId,
      sha256: sha256Bytes(bytes),
      evidence: rokotJoiningEvidenceSchema.parse(JSON.parse(new TextDecoder().decode(bytes))),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const artifactIdentity = artifacts.map(({ itemId, sha256 }) => ({ itemId, sha256 }));
const output = {
  schemaVersion: "1.0.0",
  sourceReportSha256: sha256Bytes(reportBytes),
  joiningArtifactsSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(artifactIdentity))),
  summary: summarizeRokotJoiningEvidence(artifacts.map(({ evidence }) => rokotJoiningEvidenceSchema.parse(evidence))),
};
const outputBytes = new TextEncoder().encode(canonicalJson(output));
await writeFile(resolve(outputPath), outputBytes, { flag: "wx" });
console.log(JSON.stringify({ reportSha256: sha256Bytes(outputBytes), ...output }));
