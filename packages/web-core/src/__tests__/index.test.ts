import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { WEB_CORE_VERSION } from "../index";

describe("web core package", () => {
  it("exposes a stable package version marker", () => {
    expect(WEB_CORE_VERSION).toBe("0.1.0");
  });

  it("does not expose test helpers from the runtime entrypoint", async () => {
    const entrypoint = await readFile(new URL("../index.ts", import.meta.url), "utf8");
    expect(entrypoint).not.toContain("repositoryContract");
  });
});
