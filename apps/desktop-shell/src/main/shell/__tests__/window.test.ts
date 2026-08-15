import type { BrowserWindow } from "electron";
import { createBridgeEvent } from "@zupulse/web-core";
import { describe, expect, it, vi } from "vitest";
import { createMainWindowOwner } from "../window";

describe("createMainWindowOwner", () => {
  it("owns focus and event delivery for the current live window", () => {
    const restore = vi.fn();
    const show = vi.fn();
    const focus = vi.fn();
    const send = vi.fn();
    const window = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore,
      show,
      focus,
      webContents: { send },
    } as unknown as BrowserWindow;
    const owner = createMainWindowOwner(() => window);

    expect(owner.create()).toBe(window);
    owner.focus();
    const event = createBridgeEvent("app.command", "command-1", { command: "open-score" });
    owner.sendEvent(event);

    expect(restore).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("zupulse:event", event);
    expect(owner.get()).toBe(window);
  });
});
