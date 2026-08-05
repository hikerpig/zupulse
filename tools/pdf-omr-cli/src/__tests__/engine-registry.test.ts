import { describe, expect, it } from "vitest";
import { createEngineRegistry } from "../engine-registry";

describe("engine registry", () => {
  it("returns a stable unavailable error when Rokot is not configured", () => {
    const names = [
      "PDF_OMR_ROKOT_LLAMA_CLI",
      "PDF_OMR_ROKOT_MODEL",
      "PDF_OMR_ROKOT_MMPROJ",
      "PDF_OMR_ROKOT_ABC2XML_PYTHON",
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    try {
      expect(() => createEngineRegistry().get("rokot")).toThrow(
        expect.objectContaining({
          code: "ENGINE_UNAVAILABLE",
          context: { reason: "missing-rokot-configuration" },
        }),
      );
    } finally {
      for (const name of names) restore(name, previous[name]);
    }
  });

  it("registers Rokot from explicit configuration", () => {
    expect(() =>
      createEngineRegistry({
        rokot: {
          llamaCliPath: "/runtime/llama-cli",
          modelPath: "/models/rokot.gguf",
          mmprojPath: "/models/mmproj.gguf",
          abc2xmlPythonPath: "/runtime/python",
        },
      }).get("rokot"),
    ).not.toThrow();
  });

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
