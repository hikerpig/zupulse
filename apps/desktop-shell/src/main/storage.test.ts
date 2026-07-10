import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonStore } from "./storage";

const hash = "a".repeat(64);
const roots: string[] = [];
const valueSchema = {
  parse(value: unknown): { value: number } {
    if (typeof value !== "object" || value === null
      || Object.keys(value).length !== 1
      || typeof (value as { value?: unknown }).value !== "number") {
      throw new Error("invalid value");
    }
    return value as { value: number };
  },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tab-viewer-storage-"));
  roots.push(root);
  return root;
}

describe("JsonStore", () => {
  it.each([
    ["invalid JSON", "not-json"],
    ["schema-invalid JSON", JSON.stringify({ value: "bad" })],
  ])("quarantines %s and returns no value", async (_name, source) => {
    const root = await tempRoot();
    await mkdir(join(root, "sidecars"), { recursive: true });
    await writeFile(join(root, "sidecars", `${hash}.json`), source);
    const warnings: string[] = [];
    const store = new JsonStore(root, "sidecars", valueSchema, code => warnings.push(code));

    expect(await store.read(hash)).toBeUndefined();
    expect(warnings).toEqual(["CORRUPT_PERSISTED_DATA"]);
    expect((await readdir(join(root, "sidecars"))).some(name => name.includes(".corrupt"))).toBe(true);
  });

  it("returns undefined for missing data and rejects invalid hashes", async () => {
    const store = new JsonStore(await tempRoot(), "resume", valueSchema, () => undefined);
    await expect(store.read(hash)).resolves.toBeUndefined();
    await expect(store.read("abc")).rejects.toThrow("INVALID_CONTENT_HASH");
  });

  it("serializes writes per identity", async () => {
    const root = await tempRoot();
    const store = new JsonStore(root, "sidecars", valueSchema, () => undefined);
    await Promise.all([store.write(hash, { value: 1 }), store.write(hash, { value: 2 })]);
    expect(await store.read(hash)).toEqual({ value: 2 });
    expect(JSON.parse(await readFile(join(root, "sidecars", `${hash}.json`), "utf8"))).toEqual({ value: 2 });
  });

  it("continues the write queue after a rejected value", async () => {
    const store = new JsonStore(await tempRoot(), "sidecars", valueSchema, () => undefined);
    await expect(store.write(hash, { value: "bad" } as never)).rejects.toThrow();
    await expect(store.write(hash, { value: 2 })).resolves.toBeUndefined();
    expect(await store.read(hash)).toEqual({ value: 2 });
  });
});
