import { resolve } from "node:path";
export function createPdfJsOptions(options: { standardFontDirectory?: string; wasmDirectory?: string } = {}): {
  standardFontDataUrl: string;
  wasmUrl: string;
} {
  return {
    standardFontDataUrl: directoryPath(
      options.standardFontDirectory ?? resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts"),
    ),
    wasmUrl: directoryPath(options.wasmDirectory ?? resolve(process.cwd(), "node_modules/pdfjs-dist/wasm")),
  };
}

function directoryPath(directory: string): string {
  return directory.endsWith("/") ? directory : `${directory}/`;
}
