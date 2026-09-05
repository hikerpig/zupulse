import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: () => {
    throw Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
  },
}));

import { startProcessResourceSampler } from "../resource-metrics";

describe("process resource sampler", () => {
  it("reports unavailable samples without rejecting when ps cannot spawn", async () => {
    const sampler = startProcessResourceSampler(123, 1);

    await expect(sampler.stop()).resolves.toEqual({
      scope: "process-group",
      sampleIntervalMs: 1,
      sampleCount: 0,
    });
  });
});
