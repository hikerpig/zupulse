import { describe, expect, it } from "vitest";
import type { ImportDiagnosticCode } from "@zupulse/web-core";
import { importDiagnosticKey, importDiagnosticKeys } from "../import-diagnostic";

describe("import diagnostic translations", () => {
  it("maps every stable code and falls back for unknown runtime input", () => {
    const codes = Object.keys(importDiagnosticKeys) as ImportDiagnosticCode[];
    expect(codes).toHaveLength(8);
    for (const code of codes) expect(importDiagnosticKey(code)).toBe(importDiagnosticKeys[code]);
    expect(importDiagnosticKey("future-code")).toBe("errors:import.generic");
  });
});
