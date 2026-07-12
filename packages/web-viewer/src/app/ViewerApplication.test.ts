import { describe, expect, it, vi } from "vitest";
import { ViewerApplication } from "./ViewerApplication";

describe("ViewerApplication", () => {
  it("keeps cancellation on the current session and replaces a selected file", async () => {
    const destroy = vi.fn(async () => undefined);
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      undefined,
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const application = new ViewerApplication(
      { openScore: async () => files.shift(), subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy }),
    );

    await application.openScore();
    const firstSessionId = application.getSnapshot().currentSessionId;
    await application.openScore();
    expect(application.getSnapshot().currentSessionId).toBe(firstSessionId);

    await application.openScore();
    expect(application.getSnapshot().currentSessionId).not.toBe(firstSessionId);
    expect(destroy).toHaveBeenCalledOnce();
    await application.destroy();
  });
});
