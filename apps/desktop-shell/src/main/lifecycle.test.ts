import { describe, expect, it, vi } from "vitest";
import { DesktopLifecycleCoordinator } from "./lifecycle";

describe("DesktopLifecycleCoordinator", () => {
  it("waits for prepare-close acknowledgement", async () => {
    const sendEvent = vi.fn();
    const coordinator = new DesktopLifecycleCoordinator(sendEvent, { timeoutMs: 5000 });
    const closing = coordinator.prepareClose();
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "app.lifecycle",
        payload: { state: "prepare-close" },
      }),
    );
    coordinator.acknowledge("prepare-close");
    await expect(closing).resolves.toBe("acknowledged");
  });

  it("coalesces duplicate states and reports a stable timeout", async () => {
    vi.useFakeTimers();
    const sendEvent = vi.fn();
    const onTimeout = vi.fn();
    const coordinator = new DesktopLifecycleCoordinator(sendEvent, { timeoutMs: 5000, onTimeout });
    const first = coordinator.request("suspend");
    const second = coordinator.request("suspend");
    expect(first).toBe(second);
    expect(sendEvent).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(first).resolves.toBe("timed-out");
    expect(onTimeout).toHaveBeenCalledWith("LIFECYCLE_ACK_TIMEOUT", "suspend");
    vi.useRealTimers();
  });
});
