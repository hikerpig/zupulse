// Send one command to a running driver and wait for its result.
// Usage: node cmd.mjs <workdir> '<json>'
// Optional command field __timeout (ms) overrides the default 240s wait.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const workdir = resolve(process.argv[2] ?? ".");
const pidPath = join(workdir, "driver.pid");
const readyPath = join(workdir, "driver.ready");
const windowClosedPath = join(workdir, "driver.window-closed");
if (!existsSync(pidPath) || !existsSync(readyPath)) {
  console.log(JSON.stringify({ ok: false, error: "driver not ready (missing driver.pid or driver.ready)" }));
  process.exit(1);
}
if (existsSync(windowClosedPath)) {
  console.log(JSON.stringify({ ok: false, error: "page closed; restart the driver (browser-profile persists)" }));
  process.exit(1);
}
const pid = Number((await readFile(pidPath, "utf8")).trim());
if (!Number.isInteger(pid) || pid <= 0) {
  console.log(JSON.stringify({ ok: false, error: `invalid driver.pid: ${pid}` }));
  process.exit(1);
}
try {
  process.kill(pid, 0);
} catch {
  console.log(JSON.stringify({ ok: false, error: `driver pid ${pid} is not running` }));
  process.exit(1);
}

const cmd = JSON.parse(process.argv[3]);
const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const timeoutMs = cmd.__timeout ?? 240000;
delete cmd.__timeout;
await writeFile(join(workdir, "cmd", `${id}.json`), JSON.stringify(cmd));
const deadline = Date.now() + timeoutMs;
for (;;) {
  try {
    const text = await readFile(join(workdir, "res", `${id}.json`), "utf8");
    console.log(text);
    process.exit(JSON.parse(text).ok === false ? 1 : 0);
  } catch {
    if (existsSync(windowClosedPath)) {
      console.log(JSON.stringify({ ok: false, error: "page closed; restart the driver (browser-profile persists)" }));
      process.exit(1);
    }
    if (Date.now() > deadline) {
      console.log(JSON.stringify({ ok: false, error: "command timed out" }));
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
