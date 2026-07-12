import { describe, expect, it } from "vitest";
import { createImportDiagnostic } from "./diagnostics";

describe("import diagnostics", () => {
  it("maps stable codes to user-facing summaries", () => {
    expect(createImportDiagnostic("resource-limit-exceeded")).toMatchObject({
      code: "resource-limit-exceeded", severity: "error",
    });
    expect(createImportDiagnostic("no-playable-timeline").severity).toBe("warning");
  });
});
