import { runPdfOmrCommand } from "./command";
import { exitCodeForPdfOmrError, PdfOmrError } from "./errors";
import { pdfOmrErrorReportSchema } from "./schemas";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

runPdfOmrCommand(process.argv.slice(2), { signal: controller.signal })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error: unknown) => {
    const canonical =
      error instanceof PdfOmrError
        ? error
        : new PdfOmrError("INVALID_INPUT", "unexpected CLI failure", { cause: error });
    console.error(
      JSON.stringify(
        pdfOmrErrorReportSchema.parse({
          schemaVersion: "1.0.0",
          command: "error",
          error: canonical.toJSON(),
        }),
        null,
        2,
      ),
    );
    process.exitCode = exitCodeForPdfOmrError(canonical);
  });
