export type ImportDiagnosticCode =
  | "unsupported-format"
  | "malformed-score"
  | "resource-limit-exceeded"
  | "mxl-container-missing"
  | "mxl-rootfile-missing"
  | "empty-score"
  | "no-playable-timeline"
  | "core-structure-mismatch";

export type ImportDiagnostic = {
  code: ImportDiagnosticCode;
  severity: "info" | "warning" | "error";
  context?: Record<string, string | number | boolean>;
};

const definitions: Record<ImportDiagnosticCode, Omit<ImportDiagnostic, "code" | "context">> = {
  "unsupported-format": { severity: "error" },
  "malformed-score": { severity: "error" },
  "resource-limit-exceeded": { severity: "error" },
  "mxl-container-missing": { severity: "error" },
  "mxl-rootfile-missing": { severity: "error" },
  "empty-score": { severity: "warning" },
  "no-playable-timeline": { severity: "warning" },
  "core-structure-mismatch": { severity: "error" },
};

export function createImportDiagnostic(
  code: ImportDiagnosticCode,
  context?: ImportDiagnostic["context"],
): ImportDiagnostic {
  return context === undefined ? { code, ...definitions[code] } : { code, ...definitions[code], context };
}

export class ImportPreflightError extends Error {
  constructor(
    public readonly code: ImportDiagnosticCode,
    message = code,
  ) {
    super(message);
    this.name = "ImportPreflightError";
  }
}
