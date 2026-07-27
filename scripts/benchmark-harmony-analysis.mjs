import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const viteNode = fileURLToPath(new URL("../node_modules/vite-node/vite-node.mjs", import.meta.url));
const defaultScore = "test-fixtures/musicxml/K331-3_reviewed.mxl";
const defaultResultSha256 = "9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0";
const userArguments = process.argv.slice(2).filter((argument) => argument !== "--");
const score = userArguments[0]?.startsWith("-") === false ? userArguments.shift() : defaultScore;
const commandArguments = [
  "--expose-gc",
  viteNode,
  "tools/harmony-cli/src/cli.ts",
  "benchmark",
  score,
  ...userArguments,
];

appendDefaultOption(commandArguments, "--runs", "5");
appendDefaultOption(commandArguments, "--warmup-runs", "1");
if (score === defaultScore) {
  appendDefaultOption(commandArguments, "--expected-result-sha256", defaultResultSha256);
}

const result = spawnSync(process.execPath, commandArguments, {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Harmony benchmark terminated by ${result.signal}`);
process.exitCode = result.status ?? 1;

function appendDefaultOption(arguments_, name, value) {
  if (!arguments_.includes(name)) arguments_.push(name, value);
}
