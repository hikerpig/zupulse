import { describe, expect, it, vi } from "vitest";
import { PdfOmrError, type EngineRegistry, type OmrEngineAdapter } from "@zupulse/pdf-omr-cli/pipeline";
import { preflightPdfOmrEngines, resolveAudiverisExecutable } from "../pdf-omr-engine-preflight";

describe("Desktop PDF OMR engine preflight", () => {
  it("prefers explicit Audiveris configuration before macOS app discovery", async () => {
    const isExecutable = vi.fn(async () => true);

    await expect(
      resolveAudiverisExecutable({
        configuredExecutable: "/configured/Audiveris",
        homeDirectory: "/Users/tester",
        platform: "darwin",
        isExecutable,
      }),
    ).resolves.toBe("/configured/Audiveris");
    expect(isExecutable).not.toHaveBeenCalled();
  });

  it("finds a user-level macOS Audiveris app and otherwise falls back to PATH", async () => {
    const userExecutable = "/Users/tester/Applications/Audiveris.app/Contents/MacOS/Audiveris";

    await expect(
      resolveAudiverisExecutable({
        homeDirectory: "/Users/tester",
        platform: "darwin",
        isExecutable: async (candidate) => candidate === userExecutable,
      }),
    ).resolves.toBe(userExecutable);
    await expect(
      resolveAudiverisExecutable({
        homeDirectory: "/Users/tester",
        platform: "linux",
        isExecutable: async () => false,
      }),
    ).resolves.toBe("audiveris");
  });

  it("returns inspected versions and bounded unavailable reasons without paths", async () => {
    const registry: EngineRegistry = {
      get(engineId) {
        if (engineId === "audiveris") {
          return adapter(async () => ({
            id: "audiveris",
            version: "5.11.0",
            executable: "Audiveris",
            commandTemplate: [],
            inputKinds: ["pdf", "image"],
            license: { id: "AGPL-3.0-only", source: "https://example.invalid/license" },
          }));
        }
        if (engineId === "rokot") {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "not configured", {
            context: { reason: "missing-rokot-configuration", path: "/private/model.gguf" },
          });
        }
        throw new PdfOmrError("ENGINE_UNAVAILABLE", "not configured", {
          context: { reason: `missing-${engineId}-configuration` },
        });
      },
    };

    const engines = await preflightPdfOmrEngines(registry);

    expect(engines).toEqual([
      { id: "audiveris", version: "5.11.0", available: true, inputKinds: ["pdf", "image"] },
      {
        id: "transcoda",
        version: "unknown",
        available: false,
        inputKinds: ["pdf"],
        reason: "missing-transcoda-configuration",
      },
      {
        id: "legato",
        version: "unknown",
        available: false,
        inputKinds: ["pdf"],
        reason: "missing-legato-configuration",
      },
      {
        id: "rokot",
        version: "unknown",
        available: false,
        inputKinds: ["pdf"],
        reason: "missing-rokot-configuration",
      },
    ]);
    expect(JSON.stringify(engines)).not.toContain("/private/");
  });
});

function adapter(inspectEnvironment: OmrEngineAdapter["inspectEnvironment"]): OmrEngineAdapter {
  return {
    inspectEnvironment,
    async recognize() {
      throw new Error("not used");
    },
    normalize() {
      throw new Error("not used");
    },
  };
}
