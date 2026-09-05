import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { rokotOptionsFromEnvironment } from "../src/engine-registry";
import {
  evaluateRokotHeaderContextWork,
  uniquePredictedKeys,
  type HeaderContextWorkSpec,
} from "../src/benchmark/rokot-header-context-ablation";
import { ROKOT_SYSTEM_CONTEXT_POLICIES, type RokotSystemContextPolicy } from "../src/engines/rokot-system-context";

const args = parseArgs(process.argv.slice(2));
const options = rokotOptionsFromEnvironment();
if (options === undefined) throw new Error("Rokot environment is not configured");
const outputDirectory = resolve(args.output);
await mkdir(outputDirectory, { recursive: true });
console.error(`evaluating ${args.spec.id}`);
const observation = await evaluateRokotHeaderContextWork({
  spec: args.spec,
  outputDirectory,
  rokot: options,
  policies: args.policies,
});
const report = {
  schemaVersion: "1.0.0" as const,
  status: "development-evidence" as const,
  baselinePolicy: "previous-prediction-headers-v1",
  probePolicies: args.policies.filter((policy) => policy !== "previous-prediction-headers-v1"),
  works: [compactWork(observation)],
};
const bytes = new TextEncoder().encode(canonicalJson(report));
await writeFile(join(outputDirectory, "summary.json"), bytes, { flag: "wx" });
console.log(
  JSON.stringify({
    outputDirectory,
    summarySha256: sha256Bytes(bytes),
    workId: observation.work.id,
    systemCount: observation.materialization.systemCount,
  }),
);

function compactWork(observation: Awaited<ReturnType<typeof evaluateRokotHeaderContextWork>>) {
  return {
    ...observation,
    variants: Object.fromEntries(
      Object.entries(observation.variants).map(([policy, variant]) => [
        policy,
        {
          policy: variant.policy,
          draftSha256: variant.draftSha256,
          elapsedMs: variant.elapsedMs,
          modelUnitCount: variant.modelUnitCount,
          measuresPerStaff: variant.measuresPerStaff,
          predictedKeys: uniquePredictedKeys(variant.predictedHeaders),
          keySequence: variant.predictedHeaders
            .map((entry) => ("key" in entry.headers ? entry.headers.key : "UNSAFE"))
            .join(""),
          rawDiagnosticCount: variant.rawDiagnosticCount,
          rawDiagnosticsByCode: variant.rawDiagnosticsByCode,
          validatedDiagnosticCount: variant.validatedDiagnosticCount,
          validatedDiagnosticsByCode: variant.validatedDiagnosticsByCode,
          readiness: variant.readiness,
          symbolic: variant.symbolic,
        },
      ]),
    ),
  };
}

function parseArgs(input: readonly string[]): {
  output: string;
  spec: HeaderContextWorkSpec;
  policies: RokotSystemContextPolicy[];
} {
  const flags = new Map<string, string>();
  for (let index = 0; index < input.length; index += 2) {
    const name = input[index];
    const value = input[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--") || flags.has(name)) {
      throw usage();
    }
    flags.set(name, value);
  }
  const output = flags.get("--output");
  const id = flags.get("--id");
  const inputPath = flags.get("--input");
  const groundTruthPath = flags.get("--ground-truth");
  const staffLayout = flags.get("--staff-layout");
  const fragmented = flags.get("--fragmented") ?? "false";
  const pairAdjacent = flags.get("--pair-adjacent") ?? "false";
  const category = flags.get("--category") ?? "derived-controlled-grand-staff";
  const policyList = flags.get("--policies") ?? "previous-prediction-headers-v1,previous-lm-headers-v1";
  if (
    output === undefined ||
    id === undefined ||
    inputPath === undefined ||
    groundTruthPath === undefined ||
    (staffLayout !== "single-staff" && staffLayout !== "grand-staff") ||
    (fragmented !== "true" && fragmented !== "false") ||
    (pairAdjacent !== "true" && pairAdjacent !== "false")
  ) {
    throw usage();
  }
  const policies = policyList.split(",").map((policy) => {
    if (!ROKOT_SYSTEM_CONTEXT_POLICIES.includes(policy as RokotSystemContextPolicy)) throw usage();
    return policy as RokotSystemContextPolicy;
  });
  return {
    output,
    policies,
    spec: {
      id,
      category,
      inputPath: resolve(inputPath),
      groundTruthPath: resolve(groundTruthPath),
      staffLayout,
      allowFragmentedRuns: fragmented === "true",
      ...(pairAdjacent === "true" ? { pairAdjacentUnpairedGroups: true } : {}),
    },
  };
}

function usage(): Error {
  return new Error(
    "usage: run_rokot_header_context_work.ts --output <dir> --id <id> --input <pdf> --ground-truth <xml> --staff-layout <single-staff|grand-staff> [--fragmented true|false] [--pair-adjacent true|false] [--policies a,b] [--category <name>]",
  );
}
