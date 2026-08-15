import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DiagnosticStore } from "../store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-diagnostic-store-"));
  roots.push(root);
  return root;
}

describe("DiagnosticStore", () => {
  it("serializes concurrent appends and rotates using current plus incoming bytes", async () => {
    const root = await tempRoot();
    const store = new DiagnosticStore(root, { maximumBytes: 9 });

    await Promise.all([store.append("first\n"), store.append("two\n"), store.append("3\n")]);

    expect(await readFile(join(root, "desktop.log.1"), "utf8")).toBe("first\n");
    expect(await readFile(join(root, "desktop.log"), "utf8")).toBe("two\n3\n");
    expect((await stat(join(root, "desktop.log"))).size).toBeLessThanOrEqual(9);
  });

  it("snapshots the previous segment before the current segment without mutation", async () => {
    const root = await tempRoot();
    const store = new DiagnosticStore(root, { maximumBytes: 10 });
    await store.append("older\n");
    await store.append("newer\n");

    await expect(store.snapshot()).resolves.toBe("older\nnewer\n");
    expect(await readFile(join(root, "desktop.log.1"), "utf8")).toBe("older\n");
    expect(await readFile(join(root, "desktop.log"), "utf8")).toBe("newer\n");
  });

  it("removes only diagnostic segments older than seven days during initialization", async () => {
    const root = await tempRoot();
    const current = join(root, "desktop.log");
    const previous = join(root, "desktop.log.1");
    await writeFile(current, "recent\n");
    await writeFile(previous, "stale\n");
    const now = new Date("2026-08-08T00:00:00.000Z");
    const stale = new Date("2026-07-31T23:59:59.000Z");
    await utimes(previous, stale, stale);

    const store = new DiagnosticStore(root, { now: () => now });
    await store.initialize();

    expect(await readFile(current, "utf8")).toBe("recent\n");
    await expect(readFile(previous, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
