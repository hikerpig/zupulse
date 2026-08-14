import { describe, expect, it } from "vitest";
import type { RecognitionProviderConfigurationStore } from "../recognition-provider-configuration-store";
import { RecognitionProviderSettings, RecognitionSettingsError } from "../recognition-provider-settings";

describe("RecognitionProviderSettings", () => {
  it("registers a trimmed absolute path as an opaque selection", async () => {
    const settings = await createSettings();

    const selection = settings.registerSelection("audiveris", "executable", "  /opt/audiveris/bin/Audiveris  ");

    expect(selection).toMatchObject({ label: "Audiveris", kind: "executable" });
    expect(selection.selectionToken).not.toContain("/opt/audiveris");
  });

  it("rejects a relative manually entered resource path", async () => {
    const settings = await createSettings();

    expect(() => settings.registerSelection("audiveris", "executable", "bin/Audiveris")).toThrowError(
      RecognitionSettingsError,
    );
  });
});

async function createSettings(): Promise<RecognitionProviderSettings> {
  return RecognitionProviderSettings.create({
    store: { loadAll: async () => ({}) } as RecognitionProviderConfigurationStore,
    automaticAudiverisExecutable: "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
  });
}
