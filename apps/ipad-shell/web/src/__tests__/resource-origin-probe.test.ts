// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { runResourceOriginProbe, type ResourceOriginProbeCheck } from "../resource-origin-probe";

describe("runResourceOriginProbe", () => {
  it("records success, failure, and unsupported checks without aborting the matrix", async () => {
    const checks: ResourceOriginProbeCheck[] = [
      { name: "crypto", run: async () => "sha-256" },
      {
        name: "audioWorklet",
        run: async () => {
          throw new Error("module rejected");
        },
      },
      { name: "worker", unsupportedReason: "Worker unavailable" },
    ];

    const result = await runResourceOriginProbe(checks, {
      origin: "zupulse://app",
      isSecureContext: false,
    });

    expect(result).toEqual({
      origin: "zupulse://app",
      isSecureContext: false,
      checks: {
        crypto: { status: "success", detail: "sha-256" },
        audioWorklet: { status: "failure", detail: "module rejected" },
        worker: { status: "unsupported", detail: "Worker unavailable" },
      },
    });
  });

  it("redacts non-Error failures instead of serializing arbitrary values", async () => {
    const result = await runResourceOriginProbe([
      {
        name: "dynamicImport",
        run: async () => {
          throw { source: "private payload" };
        },
      },
    ]);

    expect(result.checks.dynamicImport).toEqual({
      status: "failure",
      detail: "RESOURCE_PROBE_FAILED",
    });
  });
});
