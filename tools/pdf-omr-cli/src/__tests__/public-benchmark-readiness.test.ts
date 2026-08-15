import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineRegistry } from "../engine-registry";
import type { OmrEngineAdapter } from "../engines/types";
import { PdfOmrError } from "../errors";
import { assessEngineReadiness, verifyProfiledCorpusAssets } from "../benchmark/public-benchmark-readiness";
import { canonicalJson, sha256Bytes } from "../canonical-json";

describe("public benchmark readiness", () => {
  it("reports every engine independently without exposing raw exceptions", async () => {
    const registry: EngineRegistry = {
      get(engineId) {
        if (engineId === "audiveris") return readyAdapter();
        if (engineId === "transcoda") {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "secret local path", {
            context: { reason: "missing-transcoda-configuration" },
          });
        }
        throw new Error("unexpected secret");
      },
    };

    await expect(assessEngineReadiness(registry, ["audiveris", "transcoda", "rokot"])).resolves.toEqual([
      {
        engineId: "audiveris",
        status: "ready",
        environment: {
          version: "5.11.0",
          inputKinds: ["pdf", "image"],
        },
      },
      {
        engineId: "transcoda",
        status: "unavailable",
        failure: { code: "ENGINE_UNAVAILABLE", reason: "missing-transcoda-configuration" },
      },
      {
        engineId: "rokot",
        status: "unavailable",
        failure: { code: "ENGINE_UNAVAILABLE", reason: "environment-inspection-failed" },
      },
    ]);
  });

  it("maps a missing executable to a stable readiness reason", async () => {
    const registry: EngineRegistry = {
      get() {
        return {
          ...readyAdapter(),
          async inspectEnvironment() {
            throw new PdfOmrError("ENGINE_UNAVAILABLE", "local command is absent", {
              context: { command: "/secret/audiveris" },
            });
          },
        };
      },
    };

    await expect(assessEngineReadiness(registry, ["audiveris"])).resolves.toEqual([
      {
        engineId: "audiveris",
        status: "unavailable",
        failure: { code: "ENGINE_UNAVAILABLE", reason: "executable-not-found" },
      },
    ]);
  });

  it("verifies manifest identity and every selected asset hash before a run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "public-benchmark-readiness-"));
    const input = new TextEncoder().encode("pdf");
    const groundTruth = new TextEncoder().encode("musicxml");
    await writeFile(join(directory, "input.pdf"), input);
    await writeFile(join(directory, "truth.musicxml"), groundTruth);
    const manifest = {
      schemaVersion: "1.0.0",
      corpusId: "profile",
      protocolVersion: "1.0.0",
      items: [
        {
          id: "item",
          workId: "work",
          variantId: "source",
          split: "development",
          category: "contract",
          input: { path: "input.pdf", sha256: sha256Bytes(input) },
          groundTruth: { path: "truth.musicxml", sha256: sha256Bytes(groundTruth), format: "musicxml" },
          license: { id: "test", source: "https://example.com" },
        },
      ],
    };
    const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
    const manifestPath = join(directory, "manifest.json");
    await writeFile(manifestPath, manifestBytes);

    await expect(verifyProfiledCorpusAssets(manifestPath)).resolves.toEqual({
      corpusId: "profile",
      manifestSha256: sha256Bytes(manifestBytes),
      itemCount: 1,
      verifiedAssetCount: 2,
    });

    await writeFile(join(directory, "input.pdf"), "changed");
    await expect(verifyProfiledCorpusAssets(manifestPath)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: { reason: "corpus-hash-mismatch", itemId: "item", artifact: "input" },
    });
  });
});

function readyAdapter(): OmrEngineAdapter {
  return {
    async inspectEnvironment() {
      return {
        id: "audiveris",
        version: "5.11.0",
        executable: "audiveris",
        commandTemplate: [],
        inputKinds: ["pdf", "image"],
        license: { id: "AGPL-3.0-only", source: "https://example.com" },
      };
    },
    async recognize() {
      throw new Error("not used");
    },
    normalize() {
      throw new Error("not used");
    },
  };
}
