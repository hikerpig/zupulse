import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TelemetryPreferenceStore } from "../telemetry-preference-store";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "zupulse-telemetry-"));
}

describe("TelemetryPreferenceStore", () => {
  it("creates one installation identity and a fresh session per store instance", async () => {
    const directory = await temporaryDirectory();
    try {
      const first = new TelemetryPreferenceStore(directory);
      const firstState = await first.load();
      const second = new TelemetryPreferenceStore(directory);
      const secondState = await second.load();

      expect(firstState.installationId).toBe(secondState.installationId);
      expect(firstState.applicationSessionId).not.toBe(secondState.applicationSessionId);
      expect(JSON.parse(await readFile(path.join(directory, "telemetry-preferences.json"), "utf8"))).toMatchObject({
        enabled: true,
        installationId: firstState.installationId,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed and quarantines corrupt state", async () => {
    const directory = await temporaryDirectory();
    try {
      await (
        await import("node:fs/promises")
      ).writeFile(path.join(directory, "telemetry-preferences.json"), JSON.stringify({ enabled: "yes" }));
      const state = await new TelemetryPreferenceStore(directory).load();
      expect(state).toEqual({ schemaVersion: 1, enabled: false, noticeAcknowledged: false });
      expect((await readdir(directory)).some((file) => file.endsWith(".corrupt"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists preference before returning and clears identity on disable", async () => {
    const directory = await temporaryDirectory();
    try {
      const store = new TelemetryPreferenceStore(directory);
      const initial = await store.load();
      const disabled = await store.setPreference(false);
      expect(disabled).toEqual({ schemaVersion: 1, enabled: false, noticeAcknowledged: true });
      expect(JSON.parse(await readFile(path.join(directory, "telemetry-preferences.json"), "utf8"))).not.toHaveProperty(
        "installationId",
      );
      const enabled = await store.setPreference(true);
      expect(enabled.installationId).not.toBe(initial.installationId);
      expect(enabled.applicationSessionId).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
