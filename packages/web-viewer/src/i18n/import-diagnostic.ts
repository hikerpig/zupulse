import type { ImportDiagnosticCode } from "@zupulse/web-core";

export const importDiagnosticKeys = {
  "unsupported-format": "errors:import.unsupportedFormat",
  "malformed-score": "errors:import.malformedScore",
  "resource-limit-exceeded": "errors:import.resourceLimitExceeded",
  "mxl-container-missing": "errors:import.mxlContainerMissing",
  "mxl-rootfile-missing": "errors:import.mxlRootfileMissing",
  "empty-score": "errors:import.emptyScore",
  "no-playable-timeline": "errors:import.noPlayableTimeline",
  "core-structure-mismatch": "errors:import.coreStructureMismatch",
} as const satisfies Record<ImportDiagnosticCode, `errors:import.${string}`>;

export function importDiagnosticKey(code: unknown): `errors:import.${string}` {
  return typeof code === "string" && code in importDiagnosticKeys
    ? importDiagnosticKeys[code as ImportDiagnosticCode]
    : "errors:import.generic";
}
