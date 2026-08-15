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
