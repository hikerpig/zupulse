import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("iPad Simulator test runner", () => {
  it("serializes tests to avoid unstable concurrent Simulator clones", async () => {
    const source = await readFile(new URL("../run-xcode-tests.mjs", import.meta.url), "utf8");

    expect(source).toContain('"-parallel-testing-enabled",');
    expect(source).toContain('"NO",');
  });
});
