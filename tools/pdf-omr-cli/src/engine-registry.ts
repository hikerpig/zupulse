import { createAudiverisAdapter } from "./engines/audiveris";
import { createTranscodaAdapter, type TranscodaAdapterOptions } from "./engines/transcoda";
import type { OmrEngineAdapter } from "./engines/types";
import { PdfOmrError } from "./errors";

export type EngineRegistry = {
  get(engineId: string): OmrEngineAdapter;
};

export function createEngineRegistry(
  options: {
    audiverisExecutable?: string;
    audiverisEnvironment?: Readonly<Record<string, string>>;
    transcoda?: TranscodaAdapterOptions;
  } = {},
): EngineRegistry {
  return {
    get(engineId) {
      if (engineId === "audiveris") {
        return createAudiverisAdapter({
          executable: options.audiverisExecutable ?? process.env.PDF_OMR_AUDIVERIS_EXECUTABLE ?? "audiveris",
          ...(options.audiverisEnvironment === undefined ? {} : { environment: options.audiverisEnvironment }),
        });
      }
      if (engineId === "transcoda") {
        const configured = options.transcoda ?? transcodaOptionsFromEnvironment();
        if (configured === undefined) {
          throw new PdfOmrError("ENGINE_UNAVAILABLE", "Transcoda environment is not configured", {
            context: { reason: "missing-transcoda-configuration" },
          });
        }
        return createTranscodaAdapter(configured);
      }
      {
        throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown OMR engine", {
          context: { engineId },
        });
      }
    },
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
