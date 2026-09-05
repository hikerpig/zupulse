import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { rokotOptionsFromEnvironment } from "../src/engine-registry";
import {
  evaluateRokotHeaderContextWork,
  type HeaderContextWorkSpec,
} from "../src/benchmark/rokot-header-context-ablation";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const works: HeaderContextWorkSpec[] = [
  {
    id: "mozart-k331-3",
    category: "derived-controlled-grand-staff",
    inputPath: join(repoRoot, "test-fixtures/musicxml/K331-3_reviewed.pdf"),
    groundTruthPath: join(repoRoot, "test-fixtures/musicxml/K331-3_reviewed.mxl"),
    staffLayout: "grand-staff",
    allowFragmentedRuns: false,
  },
  {
    id: "melody-eight",
    category: "synthetic-clean-single-staff",
    inputPath: join(repoRoot, "tools/pdf-omr-cli/corpus/evaluation/melody-clean.pdf"),
    groundTruthPath: join(repoRoot, "tools/pdf-omr-cli/corpus/evaluation/melody-eight.musicxml"),
    staffLayout: "single-staff",
    allowFragmentedRuns: true,
  },
];

const args = parseArgs(process.argv.slice(2));
const options = rokotOptionsFromEnvironment();
if (options === undefined) throw new Error("Rokot environment is not configured");
const outputDirectory = resolve(args.output);
await mkdir(outputDirectory, { recursive: true });
const observations = [];
for (const spec of works) {
  console.error(`evaluating ${spec.id}`);
  observations.push(
    await evaluateRokotHeaderContextWork({
      spec,
      outputDirectory,
      rokot: options,
    }),
  );
}
const report = {
  schemaVersion: "1.0.0" as const,
  status: "development-evidence" as const,
  baselinePolicy: "previous-prediction-headers-v1",
  probePolicies: ["previous-lm-headers-v1", "first-system-key-v1", "key-consensus-v1"],
  works: observations,
};
const bytes = new TextEncoder().encode(canonicalJson(report));
await writeFile(join(outputDirectory, "summary.json"), bytes, { flag: "wx" });
console.log(
  JSON.stringify({
    outputDirectory,
    summarySha256: sha256Bytes(bytes),
    workIds: observations.map((work) => work.work.id),
  }),
);

function parseArgs(input: readonly string[]): { output: string } {
  const output = input[input.indexOf("--output") + 1];
  if (input[input.indexOf("--output")] !== "--output" || output === undefined) {
    throw new Error("usage: run_rokot_header_context_ablation.ts --output <directory>");
  }
  return { output };
}
