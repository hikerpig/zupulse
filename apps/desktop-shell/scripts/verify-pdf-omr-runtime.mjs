import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const shellRoot = new URL("../", import.meta.url);
const target = resolvePackagedTarget();
await access(target.executable);
await access(target.asar);

const smokeEntry = `${target.asar}/dist/main/pdf-omr-packaged-smoke-entry.cjs`;
const result = await run(target.executable, [smokeEntry]);
const report = JSON.parse(result.stdout.trim());
const expected = {
  pipelineStatus: "succeeded",
  pageCount: 1,
  absolutePathLeaked: false,
  processTreeCancelled: true,
};
if (JSON.stringify(report) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected packaged PDF OMR runtime report: ${JSON.stringify(report)}`);
}

function resolvePackagedTarget() {
  if (process.platform === "darwin") {
    const app = new URL("./out/Zupulse-darwin-arm64/Zupulse.app/Contents/", shellRoot);
    return {
      executable: fileURLToPath(new URL("./MacOS/Zupulse", app)),
      asar: fileURLToPath(new URL("./Resources/app.asar", app)),
    };
  }
  if (process.platform === "win32") {
    const root = new URL("./out/Zupulse-win32-x64/", shellRoot);
    return {
      executable: fileURLToPath(new URL("./Zupulse.exe", root)),
      asar: fileURLToPath(new URL("./resources/app.asar", root)),
    };
  }
  throw new Error(`Packaged PDF OMR runtime verification is unsupported on ${process.platform}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (exitCode === 0) resolve(output);
      else reject(new Error(`Packaged PDF OMR runtime failed (${exitCode}): ${output.stderr}`));
    });
  });
}
