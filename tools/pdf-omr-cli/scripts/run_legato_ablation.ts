import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildLegatoAblationComparison, legatoBeamCandidates } from "../src/benchmark/legato-ablation";
import { runBenchmark } from "../src/benchmark/run-benchmark";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { legatoOptionsFromEnvironment } from "../src/engine-registry";
import { createLegatoAdapter } from "../src/engines/legato";

const args = parseArgs(process.argv.slice(2));
const options = legatoOptionsFromEnvironment();
if (options === undefined) throw new Error("LEGATO environment is not configured");
const outputDirectory = resolve(args.output);
await mkdir(outputDirectory, { recursive: true });
const variants = [];
for (const numBeams of legatoBeamCandidates) {
  const adapter = createLegatoAdapter({
    ...options,
    decoder: { maxLength: 2048, numBeams, repetitionPenalty: 1.1 },
    workerMode: true,
  });
  const environment = await adapter.inspectEnvironment();
  const result = await runBenchmark(
    {
      manifestPath: resolve(args.manifest),
      engineId: "legato",
      preprocess: "none",
      outputDirectory: join(outputDirectory, `beam-${numBeams}`),
      mode: "development",
    },
    { engineRegistry: { get: () => adapter } },
  );
  variants.push({ numBeams, environment, ...result });
}
const bytes = new TextEncoder().encode(canonicalJson(buildLegatoAblationComparison(variants)));
await writeFile(join(outputDirectory, "comparison.json"), bytes, { flag: "wx" });
console.log(JSON.stringify({ outputDirectory, comparisonSha256: sha256Bytes(bytes) }));

function parseArgs(input: readonly string[]): { manifest: string; output: string } {
  const value = (name: string) => input[input.indexOf(name) + 1];
  const manifest = value("--manifest");
  const output = value("--output");
  if (manifest === undefined || output === undefined) {
    throw new Error("usage: run_legato_ablation.ts --manifest <manifest.json> --output <directory>");
  }
  return { manifest, output };
}
