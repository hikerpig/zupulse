import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RecognitionProviderConfigurationStore } from "../recognition-provider-configuration-store";

describe("RecognitionProviderConfigurationStore", () => {
  it("atomically persists provider-specific documents and loads them after restart", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zupulse-recognition-settings-"));
    const store = new RecognitionProviderConfigurationStore(directory);
    await store.save({ providerId: "audiveris", executable: "/Applications/Audiveris" });

    await expect(new RecognitionProviderConfigurationStore(directory).load("audiveris")).resolves.toEqual({
      providerId: "audiveris",
      executable: "/Applications/Audiveris",
    });
    expect(
      JSON.parse(await readFile(path.join(directory, "recognition-providers", "audiveris.json"), "utf8")),
    ).toMatchObject({
      schemaVersion: "1.0.0",
    });
  });

  it("quarantines only the corrupt provider and keeps startup available", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zupulse-recognition-settings-"));
    const providerDirectory = path.join(directory, "recognition-providers");
    const store = new RecognitionProviderConfigurationStore(directory);
    await store.save({ providerId: "audiveris", executable: "/Applications/Audiveris" });
    await writeFile(path.join(providerDirectory, "rokot.json"), "not-json", "utf8");

    await expect(store.load("rokot")).resolves.toBeUndefined();
    await expect(store.load("audiveris")).resolves.toBeTruthy();
  });
});
