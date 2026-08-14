import { describe, expect, it } from "vitest";
import { createPdfJsOptions } from "../pdfjs-options";

describe("createPdfJsOptions", () => {
  it("provides standard fonts and image decoder wasm directories", () => {
    const options = createPdfJsOptions({
      standardFontDirectory: "/runtime/fonts",
      wasmDirectory: "/runtime/wasm",
    });

    expect(options).toEqual({ standardFontDataUrl: "/runtime/fonts/", wasmUrl: "/runtime/wasm/" });
  });

  it("uses the bundled pdfjs-dist directories by default", () => {
    const options = createPdfJsOptions();

    expect(options.standardFontDataUrl).toContain("/node_modules/pdfjs-dist/standard_fonts/");
    expect(options.wasmUrl).toContain("/node_modules/pdfjs-dist/wasm/");
  });
});
