import { describe, expect, it } from "vitest";
import { createEngineRegistry } from "../engine-registry";

describe("engine registry", () => {
  it("rejects removed engines as unknown arguments", () => {
    expect(() => createEngineRegistry().get("transcoda")).toThrow(
      expect.objectContaining({ code: "INVALID_CLI_ARGUMENT", context: { engineId: "transcoda" } }),
    );
  });

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

  it("can disable environment fallback for Desktop product configuration", () => {
    const previous = {
      llama: process.env.PDF_OMR_ROKOT_LLAMA_CLI,
      model: process.env.PDF_OMR_ROKOT_MODEL,
      mmproj: process.env.PDF_OMR_ROKOT_MMPROJ,
      python: process.env.PDF_OMR_ROKOT_ABC2XML_PYTHON,
    };
    process.env.PDF_OMR_ROKOT_LLAMA_CLI = "/runtime/llama-cli";
    process.env.PDF_OMR_ROKOT_MODEL = "/models/rokot.gguf";
    process.env.PDF_OMR_ROKOT_MMPROJ = "/models/mmproj.gguf";
    process.env.PDF_OMR_ROKOT_ABC2XML_PYTHON = "/runtime/python";
    try {
      expect(() => createEngineRegistry({ environmentFallback: false }).get("rokot")).toThrow(
        expect.objectContaining({ context: { reason: "missing-rokot-configuration" } }),
      );
    } finally {
      restore("PDF_OMR_ROKOT_LLAMA_CLI", previous.llama);
      restore("PDF_OMR_ROKOT_MODEL", previous.model);
      restore("PDF_OMR_ROKOT_MMPROJ", previous.mmproj);
      restore("PDF_OMR_ROKOT_ABC2XML_PYTHON", previous.python);
    }
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
