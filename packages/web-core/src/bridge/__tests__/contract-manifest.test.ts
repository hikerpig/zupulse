import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ipadBridgeRequestSchema } from "../schemas";

type ContractFixture = {
  name: string;
  accepted: boolean;
  value: unknown;
};

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/ipad-bridge.json", import.meta.url), "utf8")) as {
  requests: ContractFixture[];
};
const manifestPath = new URL("../../../../../apps/ipad-shell/bridge/bridge-contract.json", import.meta.url);

describe("iPad Bridge contract", () => {
  it("keeps TypeScript validation aligned with the shared fixtures", () => {
    for (const fixture of fixtures.requests) {
      expect(ipadBridgeRequestSchema.safeParse(fixture.value).success, fixture.name).toBe(fixture.accepted);
    }
  });

  it("publishes a strict JSON-only manifest with the supported discriminators", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.bridgeVersion).toBe("3.0.0");
    expect(manifest.requestTypes).toEqual([
      "app.handshake",
      "app.lifecycleAck",
      "diagnostics.write",
      "file.open",
      "file.select",
    ]);
    expect(manifest.eventTypes).toEqual(["app.command", "app.lifecycle"]);
    expect(JSON.stringify(manifest)).not.toContain("Uint8Array");
    expect(manifest.envelope.additionalProperties).toBe(false);
    expect(manifest.capabilities.additionalProperties).toBe(false);
  });

  it("generates deterministically and detects checked-in drift", () => {
    const root = new URL("../../../../../", import.meta.url);
    const directory = mkdtempSync(join(tmpdir(), "zupulse-bridge-contract-"));
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");

    execFileSync("pnpm", ["exec", "vite-node", "scripts/generate-bridge-contract.mjs", "--output", first], {
      cwd: root,
    });
    execFileSync("pnpm", ["exec", "vite-node", "scripts/generate-bridge-contract.mjs", "--output", second], {
      cwd: root,
    });

    expect(readFileSync(first, "utf8")).toBe(readFileSync(second, "utf8"));
    execFileSync("pnpm", ["exec", "vite-node", "scripts/generate-bridge-contract.mjs", "--check"], { cwd: root });
  });
});
