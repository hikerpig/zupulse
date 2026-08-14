import { spawn } from "node:child_process";

const mode = process.argv[2];

if (mode === "success") {
  process.stdout.write("recognized\n");
  process.stderr.write("diagnostic\n");
} else if (mode === "fail") {
  process.stderr.write("sensitive stderr\n");
  process.exitCode = 7;
} else if (mode === "large-output") {
  process.stdout.write("x".repeat(4096));
} else if (mode === "hang") {
  setInterval(() => {}, 1000);
} else if (mode === "ignore-term") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
} else if (mode === "resource-usage") {
  const child = spawn(process.execPath, [import.meta.filename, "resource-child"], { stdio: "ignore" });
  child.on("close", () => process.stdout.write("sampled"));
} else if (mode === "resource-child") {
  const allocation = Buffer.alloc(64 * 1024 * 1024, 1);
  setTimeout(() => process.stdout.write(String(allocation.byteLength)), 400);
} else {
  process.exitCode = 2;
}
