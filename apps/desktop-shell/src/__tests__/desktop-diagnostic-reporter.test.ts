import { describe, expect, it, vi } from "vitest";
import { createDesktopDiagnosticReporter } from "../desktop-diagnostic-reporter";

describe("createDesktopDiagnosticReporter", () => {
  it("maps known and unknown operations without serializing raw errors", () => {
    const requests: unknown[] = [];
    const bridge = {
      request: vi.fn((request: unknown) => {
        requests.push(request);
        return Promise.resolve({});
      }),
    };
    let correlation = 0;
    const report = createDesktopDiagnosticReporter(bridge, () => `diagnostic-${++correlation}`);

    report(new Error("secret message", { cause: { path: "/secret/score.gp" } }), "library.open");
    report({ message: "secret payload", stack: "secret stack" }, "future.operation");

    expect(requests).toEqual([
      {
        bridgeVersion: "3.0.0",
        correlationId: "diagnostic-1",
        type: "diagnostics.write",
        payload: { code: "HOST_OPERATION_FAILED", operation: "library.open", errorCode: "VIEWER_OPEN_FAILED" },
      },
      {
        bridgeVersion: "3.0.0",
        correlationId: "diagnostic-2",
        type: "diagnostics.write",
        payload: { code: "HOST_OPERATION_FAILED", operation: "viewer.operation", errorCode: "VIEWER_OPERATION_FAILED" },
      },
    ]);
    expect(JSON.stringify(requests)).not.toContain("secret");
  });
});
