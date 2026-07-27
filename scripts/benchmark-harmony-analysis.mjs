import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const viteNode = fileURLToPath(new URL("../node_modules/vite-node/vite-node.mjs", import.meta.url));
const defaultScore = "test-fixtures/musicxml/K331-3_reviewed.mxl";
const defaultResultSha256 = "9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0";
const userArguments = process.argv.slice(2).filter((argument) => argument !== "--");
const score = userArguments[0]?.startsWith("-") === false ? userArguments.shift() : defaultScore;
const runs = integerOption(userArguments, "--runs", 5, 1);
const warmupRuns = integerOption(userArguments, "--warmup-runs", 1, 0);
const expectedResultSha256 =
  stringOption(userArguments, "--expected-result-sha256") ?? (score === defaultScore ? defaultResultSha256 : undefined);
const forwardedArguments = withoutOptions(userArguments, ["--runs", "--warmup-runs", "--expected-result-sha256"]);
const samples = Array.from({ length: runs }, () =>
  runIsolatedSample({
    score,
    warmupRuns,
    expectedResultSha256,
    forwardedArguments,
  }),
);
const first = samples[0];
if (!first) throw new Error("Harmony benchmark requires at least one sample");
const checksums = new Set(samples.map((sample) => sample.result.sha256));
if (checksums.size !== 1) throw new Error("Harmony benchmark produced inconsistent isolated results");
const analysisMs = samples.flatMap((sample) => sample.performance.analysisMs);
const report = {
  ...first,
  workload: {
    ...first.workload,
    runs,
    warmupRuns,
    sampleIsolation: "process-per-sample",
  },
  performance: {
    readMs: median(samples.map((sample) => sample.performance.readMs)),
    parseAndProjectionMs: median(samples.map((sample) => sample.performance.parseAndProjectionMs)),
    analysisMs,
    medianAnalysisMs: median(analysisMs),
    rssBytesBefore: Math.min(...samples.map((sample) => sample.performance.rssBytesBefore)),
    rssBytesAfter: Math.max(...samples.map((sample) => sample.performance.rssBytesAfter)),
    maxRssBytes: Math.max(...samples.map((sample) => sample.performance.maxRssBytes)),
  },
};
console.log(JSON.stringify(report, null, 2));

function runIsolatedSample({ score, warmupRuns, expectedResultSha256, forwardedArguments }) {
  const commandArguments = [
    "--expose-gc",
    viteNode,
    "tools/harmony-cli/src/cli.ts",
    "benchmark",
    score,
    "--runs",
    "1",
    "--warmup-runs",
    String(warmupRuns),
    ...(expectedResultSha256 === undefined ? [] : ["--expected-result-sha256", expectedResultSha256]),
    ...forwardedArguments,
  ];
  const result = spawnSync(process.execPath, commandArguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Harmony benchmark sample terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(result.stderr || `Harmony benchmark sample exited ${result.status}`);
  return JSON.parse(result.stdout);
}

function integerOption(arguments_, name, fallback, minimum) {
  const raw = stringOption(arguments_, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function stringOption(arguments_, name) {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
}

function withoutOptions(arguments_, names) {
  const result = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (names.includes(arguments_[index])) {
      index += 1;
      continue;
    }
    result.push(arguments_[index]);
  }
  return result;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
