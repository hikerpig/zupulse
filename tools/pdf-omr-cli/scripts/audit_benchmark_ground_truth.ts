import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auditBenchmarkGroundTruth } from "../src/benchmark/audit-ground-truth";
import { canonicalJson } from "../src/canonical-json";

const [inventoryPath, sourceRoot, outputPath] = process.argv.slice(2);
if (inventoryPath === undefined || sourceRoot === undefined || outputPath === undefined) {
  throw new Error("usage: audit_benchmark_ground_truth.ts <inventory.json> <source-root> <output.json>");
}
const inventory = JSON.parse(await readFile(resolve(inventoryPath), "utf8")) as {
  oracleSystems: Array<{ item: { id: string }; source: { groundTruthPath: string } }>;
};
const audit = await auditBenchmarkGroundTruth(inventory.oracleSystems, resolve(sourceRoot));
await writeFile(resolve(outputPath), canonicalJson(audit));
