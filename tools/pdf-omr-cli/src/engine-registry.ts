import { createAudiverisAdapter } from "./engines/audiveris";
import type { OmrEngineAdapter } from "./engines/types";
import { PdfOmrError } from "./errors";

export type EngineRegistry = {
  get(engineId: string): OmrEngineAdapter;
};

export function createEngineRegistry(
  options: {
    audiverisExecutable?: string;
    audiverisEnvironment?: Readonly<Record<string, string>>;
  } = {},
): EngineRegistry {
  return {
    get(engineId) {
      if (engineId !== "audiveris") {
        throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown OMR engine", {
          context: { engineId },
        });
      }
      return createAudiverisAdapter({
        executable: options.audiverisExecutable ?? process.env.PDF_OMR_AUDIVERIS_EXECUTABLE ?? "audiveris",
        ...(options.audiverisEnvironment === undefined ? {} : { environment: options.audiverisEnvironment }),
      });
    },
  };
}
