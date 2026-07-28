import { describe, expect, it } from "vitest";
import { PdfOmrError, exitCodeForPdfOmrError } from "../errors";

describe("PDF OMR errors", () => {
  it.each([
    ["INVALID_CLI_ARGUMENT", 2],
    ["INVALID_INPUT", 3],
    ["ENGINE_UNAVAILABLE", 4],
    ["ENGINE_EXECUTION_FAILED", 5],
    ["ENGINE_OUTPUT_INVALID", 6],
    ["DRAFT_VALIDATION_FAILED", 7],
    ["PROJECTION_OR_EXPORT_FAILED", 8],
    ["BENCHMARK_GATE_FAILED", 9],
    ["INTERRUPTED", 130],
  ] as const)("maps %s to exit code %i", (code, exitCode) => {
    expect(exitCodeForPdfOmrError(new PdfOmrError(code, code))).toBe(exitCode);
  });

  it("exposes stable context without serializing the cause", () => {
    const error = new PdfOmrError("INVALID_INPUT", "input is invalid", {
      context: { fileName: "score.pdf" },
      cause: new Error("sensitive absolute path"),
    });

    expect(error.toJSON()).toEqual({
      code: "INVALID_INPUT",
      message: "input is invalid",
      context: { fileName: "score.pdf" },
    });
  });
});
