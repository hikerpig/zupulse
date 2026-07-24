import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runner = new URL("../run-tool-from-xcode.sh", import.meta.url);

describe("Xcode tool runner", () => {
  it("finds pnpm and node when Xcode starts with a minimal PATH", async () => {
    const home = await mkdtemp(join(tmpdir(), "zupulse-xcode-home-"));
    const pnpmDirectory = join(home, "Library/pnpm");
    const nodeDirectory = join(home, "Library/Application Support/fnm/aliases/default/bin");
    await mkdir(pnpmDirectory, { recursive: true });
    await mkdir(nodeDirectory, { recursive: true });
    await writeExecutable(join(pnpmDirectory, "pnpm"), '#!/bin/sh\nprintf "pnpm:%s\\n" "$*"\n');
    await writeExecutable(join(nodeDirectory, "node"), '#!/bin/sh\nprintf "node:%s\\n" "$*"\n');

    const environment = { HOME: home, PATH: "/usr/bin:/bin" };
    await expect(
      execFileAsync("/bin/sh", [runner.pathname, "pnpm", "ipad:web:build"], {
        env: environment,
      }),
    ).resolves.toMatchObject({ stdout: "pnpm:ipad:web:build\n" });
    await expect(
      execFileAsync("/bin/sh", [runner.pathname, "node", "verify.mjs"], {
        env: environment,
      }),
    ).resolves.toMatchObject({ stdout: "node:verify.mjs\n" });
  });

  it("rejects tools outside the build allowlist", async () => {
    await expect(
      execFileAsync("/bin/sh", [runner.pathname, "curl"], {
        env: { HOME: tmpdir(), PATH: "/usr/bin:/bin" },
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("Unsupported Xcode build tool") });
  });
});

async function writeExecutable(path: string, source: string) {
  await writeFile(path, source);
  await chmod(path, 0o755);
}
