import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runPdfOmrPackagedSmoke } from "../pdf-omr-packaged-smoke";

describe("runPdfOmrPackagedSmoke", () => {
  it("runs the pipeline and terminates a real external process tree", async () => {
    const result = await runPdfOmrPackagedSmoke({
      standardFontDirectory: resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts"),
      wasmDirectory: resolve(process.cwd(), "node_modules/pdfjs-dist/wasm"),
    });

    expect(result).toEqual({
      pipelineStatus: "succeeded",
      pageCount: 1,
      absolutePathLeaked: false,
      processTreeCancelled: true,
    });
  }, 5000);
});

describe("packaged source pitch extraction smoke gate", () => {
  it("does not pass the extractor gate merely because fallback recognition succeeded", async () => {
    await expect(
      runPdfOmrPackagedSmoke({
        standardFontDirectory: resolve("node_modules/pdfjs-dist/standard_fonts"),
        wasmDirectory: resolve("node_modules/pdfjs-dist/wasm"),
        pitchPython: resolve("missing-smoke-python"),
      }),
    ).rejects.toThrow("packaged source pitch extractor did not execute");
  });
});
