import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
    expect(manifest.requestTypes).toEqual(["app.handshake", "app.lifecycleAck", "diagnostics.write", "file.select"]);
    expect(manifest.eventTypes).toEqual(["app.command", "app.lifecycle"]);
    expect(JSON.stringify(manifest)).not.toContain("Uint8Array");
    expect(manifest.envelope.additionalProperties).toBe(false);
    expect(manifest.capabilities.additionalProperties).toBe(false);
  });

  it("detects checked-in manifest drift", () => {
    const root = new URL("../../../../../", import.meta.url);
    execFileSync("pnpm", ["exec", "vite-node", "scripts/generate-bridge-contract.mjs", "--check"], { cwd: root });
  });
});
