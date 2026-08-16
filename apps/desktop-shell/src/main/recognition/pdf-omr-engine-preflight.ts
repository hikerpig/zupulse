import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { PdfOmrError, type EngineRegistry } from "@zupulse/pdf-omr-cli/pipeline";

export type PdfOmrEngineCapability = {
  id: string;
  version: string;
  available: boolean;
  inputKinds: readonly ("pdf" | "image")[];
  reason?: string;
};

const engines = [
  { id: "audiveris", inputKinds: ["pdf", "image"] },
  { id: "legato", inputKinds: ["pdf"] },
  { id: "rokot", inputKinds: ["pdf"] },
] as const;
type PdfOmrEngineId = (typeof engines)[number]["id"];

const safeReasons = new Set([
  "missing-legato-configuration",
  "missing-rokot-configuration",
  "repository-revision-mismatch",
  "python-version-mismatch",
  "model-unreadable",
  "base-model-unreadable",
  "base-model-config-empty",
  "mmproj-unreadable",
  "model-hash-mismatch",
  "mmproj-hash-mismatch",
  "llama-build-mismatch",
  "abc-converter-unavailable",
  "invalid-version-output",
]);

export async function resolveAudiverisExecutable(options: {
  configuredExecutable?: string | undefined;
  homeDirectory: string;
  platform: NodeJS.Platform;
  isExecutable?: ((candidate: string) => Promise<boolean>) | undefined;
}): Promise<string> {
  if (options.configuredExecutable) return options.configuredExecutable;
  if (options.platform !== "darwin") return "audiveris";
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const candidates = [
    join(options.homeDirectory, "Applications/Audiveris.app/Contents/MacOS/Audiveris"),
    "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
  ];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  return "audiveris";
}

export async function preflightPdfOmrEngines(registry: EngineRegistry): Promise<PdfOmrEngineCapability[]> {
  return Promise.all(engines.map((definition) => inspectEngine(registry, definition)));
}

export function preflightPdfOmrEngine(
  registry: EngineRegistry,
  engineId: PdfOmrEngineId,
): Promise<PdfOmrEngineCapability> {
  return inspectEngine(
    registry,
    engines.find((engine) => engine.id === engineId)!,
  );
}

async function defaultIsExecutable(candidate: string): Promise<boolean> {
  return access(candidate, constants.X_OK).then(
    () => true,
    () => false,
  );
}

function availabilityReason(engineId: string, error: unknown): string {
  if (error instanceof PdfOmrError) {
    const reason = error.context?.reason;
    if (typeof reason === "string" && safeReasons.has(reason)) return reason;
    if (engineId === "audiveris" && error.code === "ENGINE_UNAVAILABLE") return "engine-executable-unavailable";
  }
  return "engine-inspection-failed";
}

async function inspectEngine(
  registry: EngineRegistry,
  definition: (typeof engines)[number],
): Promise<PdfOmrEngineCapability> {
  try {
    const environment = await registry.get(definition.id).inspectEnvironment();
    return {
      id: definition.id,
      version: environment.version,
      available: true,
      inputKinds: definition.inputKinds,
    };
  } catch (error) {
    return {
      id: definition.id,
      version: "unknown",
      available: false,
      inputKinds: definition.inputKinds,
      reason: availabilityReason(definition.id, error),
    };
  }
}
