export const pdfOmrErrorCodes = [
  "INVALID_CLI_ARGUMENT",
  "INVALID_INPUT",
  "ENGINE_UNAVAILABLE",
  "ENGINE_EXECUTION_FAILED",
  "ENGINE_OUTPUT_INVALID",
  "DRAFT_VALIDATION_FAILED",
  "PROJECTION_OR_EXPORT_FAILED",
  "BENCHMARK_GATE_FAILED",
  "INTERRUPTED",
] as const;

export type PdfOmrErrorCode = (typeof pdfOmrErrorCodes)[number];

const exitCodes: Record<PdfOmrErrorCode, number> = {
  INVALID_CLI_ARGUMENT: 2,
  INVALID_INPUT: 3,
  ENGINE_UNAVAILABLE: 4,
  ENGINE_EXECUTION_FAILED: 5,
  ENGINE_OUTPUT_INVALID: 6,
  DRAFT_VALIDATION_FAILED: 7,
  PROJECTION_OR_EXPORT_FAILED: 8,
  BENCHMARK_GATE_FAILED: 9,
  INTERRUPTED: 130,
};

export class PdfOmrError extends Error {
  readonly code: PdfOmrErrorCode;
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(
    code: PdfOmrErrorCode,
    message: string,
    options: { context?: Readonly<Record<string, unknown>>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PdfOmrError";
    this.code = code;
    if (options.context !== undefined) this.context = options.context;
  }

  toJSON(): { code: PdfOmrErrorCode; message: string; context?: Readonly<Record<string, unknown>> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.context === undefined ? {} : { context: this.context }),
    };
  }
}

export function exitCodeForPdfOmrError(error: PdfOmrError): number {
  return exitCodes[error.code];
}
