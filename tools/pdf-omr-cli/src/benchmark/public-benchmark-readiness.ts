import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EngineRegistry } from "../engine-registry";
import type { OmrEngineEnvironment } from "../engines/types";
import { PdfOmrError } from "../errors";
import { sha256Bytes } from "../canonical-json";
import { verifyCorpusManifest } from "./corpus";

export type EngineReadiness =
  | {
      engineId: string;
      status: "ready";
      environment: Pick<OmrEngineEnvironment, "version" | "modelSha256" | "inputKinds">;
    }
  | {
      engineId: string;
      status: "unavailable";
      failure: { code: "ENGINE_UNAVAILABLE"; reason: string };
    };

export async function assessEngineReadiness(
  registry: EngineRegistry,
  engineIds: readonly string[],
  signal?: AbortSignal,
): Promise<EngineReadiness[]> {
  const results = [];
  for (const engineId of engineIds) {
    try {
      const environment = await registry.get(engineId).inspectEnvironment(signal);
      results.push({
        engineId,
        status: "ready" as const,
        environment: {
          version: environment.version,
          ...(environment.modelSha256 === undefined ? {} : { modelSha256: environment.modelSha256 }),
          ...(environment.inputKinds === undefined ? {} : { inputKinds: environment.inputKinds }),
        },
      });
    } catch (error) {
      if (error instanceof PdfOmrError && error.code === "INTERRUPTED") throw error;
      results.push({
        engineId,
        status: "unavailable" as const,
        failure: {
          code: "ENGINE_UNAVAILABLE" as const,
          reason:
            error instanceof PdfOmrError && typeof error.context?.reason === "string"
              ? error.context.reason
              : error instanceof PdfOmrError && error.code === "ENGINE_UNAVAILABLE"
                ? "executable-not-found"
                : "environment-inspection-failed",
        },
      });
    }
  }
  return results;
}

export async function verifyProfiledCorpusAssets(manifestPath: string): Promise<{
  corpusId: string;
  manifestSha256: string;
  itemCount: number;
  verifiedAssetCount: number;
}> {
  const absoluteManifestPath = resolve(manifestPath);
  const manifestBytes = await readFile(absoluteManifestPath).catch((error: unknown) => {
    throw new PdfOmrError("INVALID_INPUT", "public benchmark manifest cannot be read", {
      context: { reason: "manifest-unreadable" },
      cause: error,
    });
  });
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "public benchmark manifest JSON is invalid", {
      context: { reason: "invalid-manifest-json" },
      cause: error,
    });
  }
  const manifest = verifyCorpusManifest(input);
  const corpusRoot = dirname(absoluteManifestPath);
  for (const item of manifest.items) {
    await verifyAsset(corpusRoot, item.id, "input", item.input.path, item.input.sha256);
    await verifyAsset(corpusRoot, item.id, "groundTruth", item.groundTruth.path, item.groundTruth.sha256);
  }
  return {
    corpusId: manifest.corpusId,
    manifestSha256: sha256Bytes(manifestBytes),
    itemCount: manifest.items.length,
    verifiedAssetCount: manifest.items.length * 2,
  };
}

async function verifyAsset(
  corpusRoot: string,
  itemId: string,
  artifact: "input" | "groundTruth",
  relativePath: string,
  expectedSha256: string,
): Promise<void> {
  const bytes = await readFile(resolve(corpusRoot, relativePath)).catch((error: unknown) => {
    throw new PdfOmrError("INVALID_INPUT", "public benchmark asset cannot be read", {
      context: { reason: "corpus-asset-unreadable", itemId, artifact },
      cause: error,
    });
  });
  if (sha256Bytes(bytes) !== expectedSha256) {
    throw new PdfOmrError("INVALID_INPUT", "public benchmark asset hash does not match manifest", {
      context: { reason: "corpus-hash-mismatch", itemId, artifact },
    });
  }
}
