import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateRealMultiSystemRun, realMultiSystemCaseSchema } from "../src/benchmark/real-multisystem-evaluation";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";

const casePath = process.argv[2];
const runDirectory = process.argv[3];
const outputPath = process.argv[4];
if (casePath === undefined || runDirectory === undefined || outputPath === undefined) {
  throw new Error(
    "usage: vite-node evaluate_real_multisystem_case.ts <case.json> <benchmark-run-directory> <new-output.json>",
  );
}

const caseDefinition = realMultiSystemCaseSchema.parse(JSON.parse(await readFile(resolve(casePath), "utf8")));
const evaluation = await evaluateRealMultiSystemRun(caseDefinition, resolve(runDirectory));
const outputBytes = new TextEncoder().encode(canonicalJson(evaluation));
await writeFile(resolve(outputPath), outputBytes, { flag: "wx" });
console.log(JSON.stringify({ outputSha256: sha256Bytes(outputBytes), ...evaluation }));
