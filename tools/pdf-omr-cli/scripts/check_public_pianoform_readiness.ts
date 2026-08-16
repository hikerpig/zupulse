import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { createEngineRegistry } from "../src/engine-registry";
import { assessEngineReadiness, verifyProfiledCorpusAssets } from "../src/benchmark/public-benchmark-readiness";

const flags = parseFlags(process.argv.slice(2));
const manifestPath = requiredFlag(flags, "--manifest");
const outputPath = requiredFlag(flags, "--output");
const absoluteOutputPath = resolve(outputPath);
const corpus = await verifyProfiledCorpusAssets(manifestPath);
const engines = await assessEngineReadiness(createEngineRegistry(), ["audiveris", "legato", "rokot"]);
const report = {
  schemaVersion: "1.0.0",
  corpus,
  engines,
  readyEngineIds: engines.filter((engine) => engine.status === "ready").map((engine) => engine.engineId),
};
const bytes = new TextEncoder().encode(canonicalJson(report));
await mkdir(dirname(absoluteOutputPath), { recursive: true });
await writeFile(absoluteOutputPath, bytes, { flag: "wx" });
console.log(JSON.stringify({ outputPath: absoluteOutputPath, reportSha256: sha256Bytes(bytes) }));

function parseFlags(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      throw new Error("readiness check requires --name value arguments");
    }
    if (result.has(name)) throw new Error(`duplicate argument: ${name}`);
    result.set(name, value);
  }
  return result;
}

function requiredFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) throw new Error(`missing required argument: ${name}`);
  return value;
}
