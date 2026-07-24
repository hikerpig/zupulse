import { describe, expect, it } from "vitest";
import { createImportDiagnostic } from "../diagnostics";

describe("import diagnostics", () => {
  it("returns stable code and severity without user-facing copy", () => {
    const diagnostic = createImportDiagnostic("resource-limit-exceeded");
    expect(diagnostic).toEqual({
      code: "resource-limit-exceeded",
      severity: "error",
    });
    expect("summary" in diagnostic).toBe(false);
    expect(createImportDiagnostic("no-playable-timeline").severity).toBe("warning");
  });
});
