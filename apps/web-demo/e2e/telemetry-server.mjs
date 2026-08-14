import { spawn } from "node:child_process";

const port = process.argv[2] ?? "41732";
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["exec", "rspack", "serve", "--mode", "production", "--port", port], {
  env: {
    ...process.env,
    TELEMETRY_E2E: "1",
    POSTHOG_PROJECT_TOKEN: "phc_telemetry_e2e",
  },
  stdio: "inherit",
  shell: false,
});

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
