import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAudiverisAdapter } from "./engines/audiveris";
import { createLegatoAdapter, type LegatoAdapterOptions } from "./engines/legato";
import { createRokotAdapter, type RokotAdapterOptions } from "./engines/rokot";
import { createTranscodaAdapter, type TranscodaAdapterOptions } from "./engines/transcoda";
import type { OmrEngineAdapter } from "./engines/types";
import { PdfOmrError } from "./errors";

export type EngineRegistry = {
  get(engineId: string): OmrEngineAdapter;
};

export function resolveBundledLegatoRunnerPath(): string {
  return fileURLToPath(new URL("../engines/legato-runner.py", import.meta.url));
}

export function createEngineRegistry(
  options: {
    audiverisExecutable?: string;
    audiverisEnvironment?: Readonly<Record<string, string>>;
    legato?: LegatoAdapterOptions;
    rokot?: RokotAdapterOptions;
    transcoda?: TranscodaAdapterOptions;
    environmentFallback?: boolean;
  } = {},
): EngineRegistry {
  return {
    get(engineId) {
      if (engineId === "audiveris") {
        return createAudiverisAdapter({
          executable:
            options.audiverisExecutable ??
            (options.environmentFallback === false ? undefined : process.env.PDF_OMR_AUDIVERIS_EXECUTABLE) ??
            "audiveris",
          ...(options.audiverisEnvironment === undefined ? {} : { environment: options.audiverisEnvironment }),
        });
      }
      if (engineId === "transcoda") {
        const configured =
          options.transcoda ?? (options.environmentFallback === false ? undefined : transcodaOptionsFromEnvironment());
        if (configured === undefined) {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda environment is not configured", {
            context: { reason: "missing-transcoda-configuration" },
          });
        }
        return createTranscodaAdapter(configured);
      }
      if (engineId === "legato") {
        const configured =
          options.legato ?? (options.environmentFallback === false ? undefined : legatoOptionsFromEnvironment());
        if (configured === undefined) {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "LEGATO environment is not configured", {
            context: { reason: "missing-legato-configuration" },
          });
        }
        return createLegatoAdapter(configured);
      }
      if (engineId === "rokot") {
        const configured =
          options.rokot ?? (options.environmentFallback === false ? undefined : rokotOptionsFromEnvironment());
        if (configured === undefined) {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "Rokot environment is not configured", {
            context: { reason: "missing-rokot-configuration" },
          });
        }
        return createRokotAdapter(configured);
      }
      {
        throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown OMR engine", {
          context: { engineId },
        });
      }
    },
  };
}

function rokotOptionsFromEnvironment(): RokotAdapterOptions | undefined {
  const llamaCliPath = process.env.PDF_OMR_ROKOT_LLAMA_CLI;
  const modelPath = process.env.PDF_OMR_ROKOT_MODEL;
  const mmprojPath = process.env.PDF_OMR_ROKOT_MMPROJ;
  const abc2xmlPythonPath = process.env.PDF_OMR_ROKOT_ABC2XML_PYTHON;
  if (
    llamaCliPath === undefined ||
    modelPath === undefined ||
    mmprojPath === undefined ||
    abc2xmlPythonPath === undefined
  ) {
    return undefined;
  }
  return { llamaCliPath, modelPath, mmprojPath, abc2xmlPythonPath };
}

function legatoOptionsFromEnvironment(): LegatoAdapterOptions | undefined {
  const pythonExecutable = process.env.PDF_OMR_LEGATO_PYTHON;
  const repositoryPath = process.env.PDF_OMR_LEGATO_REPOSITORY;
  const modelDirectory = process.env.PDF_OMR_LEGATO_MODEL;
  const baseModelPath = process.env.PDF_OMR_LEGATO_BASE_MODEL;
  if (
    pythonExecutable === undefined ||
    repositoryPath === undefined ||
    modelDirectory === undefined ||
    baseModelPath === undefined
  ) {
    return undefined;
  }
  return {
    pythonExecutable,
    repositoryPath,
    repositoryRevision: "8c1de27e414f487fe59086547aaae23b868ed6ca",
    modelPath: join(modelDirectory, "model.safetensors"),
    modelSha256: "cdeafc9ab30eba74e1c87f0722f869aa9c00d4c4d5986561d4abfeccd6f9cfcc",
    baseModelPath,
    runnerPath: process.env.PDF_OMR_LEGATO_RUNNER ?? resolveBundledLegatoRunnerPath(),
  };
}

function transcodaOptionsFromEnvironment(): TranscodaAdapterOptions | undefined {
  const repositoryPath = process.env.PDF_OMR_TRANSCODA_REPOSITORY;
  const checkpointPath = process.env.PDF_OMR_TRANSCODA_CHECKPOINT;
  if (repositoryPath === undefined || checkpointPath === undefined) return undefined;
  return {
    pythonExecutable: process.env.PDF_OMR_TRANSCODA_PYTHON ?? "python3.11",
    repositoryPath,
    repositoryRevision: "d4e2e687d5679ae96ca4aa6f01e06a5b338cd488",
    checkpointPath,
    checkpointSha256: "3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc",
    ...(process.env.PDF_OMR_PDFTOPPM_EXECUTABLE === undefined
      ? {}
      : { pdftoppmExecutable: process.env.PDF_OMR_PDFTOPPM_EXECUTABLE }),
    ...(process.env.PDF_OMR_TRANSCODA_CONVERTER_SCRIPT === undefined
      ? {}
      : { converterScriptPath: process.env.PDF_OMR_TRANSCODA_CONVERTER_SCRIPT }),
  };
}
