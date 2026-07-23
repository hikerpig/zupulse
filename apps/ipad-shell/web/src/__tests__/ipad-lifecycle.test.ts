// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { BRIDGE_SCHEMA_VERSION } from "@zupulse/web-core";
import { attachIpadLifecycle } from "../ipad-lifecycle";

describe("attachIpadLifecycle", () => {
  it("pauses and flushes before acknowledging suspend", async () => {
    let finishPause!: () => void;
    const pauseAndFlush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPause = resolve;
        }),
    );
    const request = vi.fn(async () => ({}));
    const detach = attachIpadLifecycle(window, { pauseAndFlush }, { request });

    window.dispatchEvent(
      new CustomEvent("zupulse:bridge-event", {
        detail: lifecycleEvent("event-1", "suspend"),
      }),
    );
    await Promise.resolve();
    expect(pauseAndFlush).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();

    finishPause();
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith("app.lifecycleAck", {
        state: "suspend",
      }),
    );
    detach();
  });

  it("handles repeated event envelopes idempotently", async () => {
    const pauseAndFlush = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({}));
    const detach = attachIpadLifecycle(window, { pauseAndFlush }, { request });
    const event = lifecycleEvent("event-2", "prepare-close");

    window.dispatchEvent(new CustomEvent("zupulse:bridge-event", { detail: event }));
    window.dispatchEvent(new CustomEvent("zupulse:bridge-event", { detail: event }));

    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(pauseAndFlush).toHaveBeenCalledOnce();
    detach();
  });

  it("ignores malformed and foreground-like events without producing play intent", async () => {
    const pauseAndFlush = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({}));
    const detach = attachIpadLifecycle(window, { pauseAndFlush }, { request });

    window.dispatchEvent(
      new CustomEvent("zupulse:bridge-event", {
        detail: {
          ...lifecycleEvent("event-3", "suspend"),
          payload: { state: "foreground" },
        },
      }),
    );
    await Promise.resolve();

    expect(pauseAndFlush).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    detach();
  });
});

function lifecycleEvent(correlationId: string, state: "suspend" | "prepare-close") {
  return {
    bridgeVersion: BRIDGE_SCHEMA_VERSION,
    correlationId,
    type: "app.lifecycle",
    payload: { state },
  };
}
