import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = resolve("tasks/legato-candidate-ceiling");
const scripts = readdirSync(directory)
  .filter((file) => /\.test\.(ts|mjs)$/.test(file))
  .sort();

describe("frozen LEGATO candidate assertions", () => {
  it("retains assertion scripts", () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  // These files are hash-bound experiment inputs; exercise their native runners without rewriting them.
  it.each(scripts)(
    "%s",
    (script) => {
      const runner = script.endsWith(".mjs") ? "--test" : resolve("node_modules/vite-node/vite-node.mjs");
      expect(() =>
        execFileSync(process.execPath, [runner, resolve(directory, script)], {
          encoding: "utf8",
          timeout: 15_000,
          stdio: "pipe",
        }),
      ).not.toThrow();
    },
    20_000,
  );
});
