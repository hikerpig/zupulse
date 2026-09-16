import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecognitionProviderConfigurationStore } from "../provider-configuration-store";
import { RecognitionProviderSettings, RecognitionSettingsError } from "../provider-settings";

describe("RecognitionProviderSettings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses production correction for saved LEGATO settings with a per-snapshot kill switch", async () => {
    const settings = await RecognitionProviderSettings.create({
      store: {
        loadAll: async () => ({
          legato: {
            providerId: "legato",
            python: "/saved/python",
            repository: "/saved/repository",
            model: "/saved/model.safetensors",
            baseModel: "/saved/base",
          },
        }),
      } as RecognitionProviderConfigurationStore,
      automaticAudiverisExecutable: "/audiveris",
    });
    vi.stubEnv("PDF_OMR_LEGATO_SOURCE_PITCH_CORRECTION", undefined);
    vi.stubEnv("PDF_OMR_LEGATO_PYTHON", "/untrusted/environment/python");
    const enabled = settings.createRegistrySnapshot();
    vi.stubEnv("PDF_OMR_LEGATO_SOURCE_PITCH_CORRECTION", "0");
    const disabled = settings.createRegistrySnapshot();
    expect(enabled.get("legato").pitchCorrectionPython).toBe("/saved/python");
    expect(disabled.get("legato").pitchCorrectionPython).toBeUndefined();
  });

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
