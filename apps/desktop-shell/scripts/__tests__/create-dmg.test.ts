import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDmgPaths } from "../create-dmg.mjs";

describe("resolveDmgPaths", () => {
  it("places the arm64 DMG beside Forge maker output", () => {
    const shellRoot = resolve("apps/desktop-shell");

    expect(
      resolveDmgPaths(shellRoot, {
        productName: "Zupulse",
        version: "0.1.0",
        arch: "arm64",
      }),
    ).toEqual({
      appPath: resolve(shellRoot, "out/Zupulse-darwin-arm64/Zupulse.app"),
      outputPath: resolve(shellRoot, "out/make/dmg/arm64/Zupulse-darwin-arm64-0.1.0.dmg"),
    });
  });
});
