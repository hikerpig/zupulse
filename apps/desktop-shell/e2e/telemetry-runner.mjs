import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = {
  ...process.env,
  TELEMETRY_E2E: "1",
  POSTHOG_PROJECT_TOKEN: "phc_telemetry_e2e",
};

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`command terminated by ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`command exited with ${code ?? 1}`));
    });
  });

try {
  await run(["build"]);
  await run(["exec", "playwright", "test", "-c", "e2e/telemetry.config.ts"]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
