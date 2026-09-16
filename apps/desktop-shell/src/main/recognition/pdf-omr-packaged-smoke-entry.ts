import { join } from "node:path";
import { runPdfOmrPackagedSmoke } from "./pdf-omr-packaged-smoke";

runPdfOmrPackagedSmoke({
  standardFontDirectory: join(__dirname, "pdfjs-standard-fonts"),
  wasmDirectory: join(__dirname, "pdfjs-wasm"),
  ...(process.argv[2] === undefined ? {} : { pitchPython: process.argv[2] }),
})
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    if (error instanceof Error && error.cause !== undefined) {
      process.stderr.write(`cause: ${error.cause instanceof Error ? error.cause.stack : String(error.cause)}\n`);
    }
    process.exitCode = 1;
  });
