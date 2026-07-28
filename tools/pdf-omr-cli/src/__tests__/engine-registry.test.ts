import { describe, expect, it } from "vitest";
import { createEngineRegistry } from "../engine-registry";

describe("engine registry", () => {
  it("returns a stable unavailable error when LEGATO is not configured", () => {
    const previous = {
      python: process.env.PDF_OMR_LEGATO_PYTHON,
      repository: process.env.PDF_OMR_LEGATO_REPOSITORY,
      model: process.env.PDF_OMR_LEGATO_MODEL,
      baseModel: process.env.PDF_OMR_LEGATO_BASE_MODEL,
    };
    delete process.env.PDF_OMR_LEGATO_PYTHON;
    delete process.env.PDF_OMR_LEGATO_REPOSITORY;
    delete process.env.PDF_OMR_LEGATO_MODEL;
    delete process.env.PDF_OMR_LEGATO_BASE_MODEL;
    try {
      expect(() => createEngineRegistry().get("legato")).toThrow(
        expect.objectContaining({
          code: "ENGINE_UNAVAILABLE",
          context: { reason: "missing-legato-configuration" },
        }),
      );
    } finally {
      restore("PDF_OMR_LEGATO_PYTHON", previous.python);
      restore("PDF_OMR_LEGATO_REPOSITORY", previous.repository);
      restore("PDF_OMR_LEGATO_MODEL", previous.model);
      restore("PDF_OMR_LEGATO_BASE_MODEL", previous.baseModel);
    }
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
