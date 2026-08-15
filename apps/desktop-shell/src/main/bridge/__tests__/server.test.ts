import { createBridgeRequest } from "@zupulse/web-core";
import { describe, expect, it, vi } from "vitest";
import { createDesktopCapabilities } from "../dispatcher";
import { installBridgeServer } from "../server";

describe("installBridgeServer", () => {
  it("reads current locale per request, records failures, and unregisters on dispose", async () => {
    const handle = vi.fn();
    const removeHandler = vi.fn();
    const recordFailure = vi.fn();
    let locale = { preference: "en-US" as const, effectiveLocale: "en-US" as const };
    const server = installBridgeServer({
      ipc: { handle, removeHandler },
      appVersion: "0.1.0",
      rendererBuildHash: "b".repeat(64),
      capabilities: createDesktopCapabilities([]),
      getLocale: () => locale,
      telemetryAvailable: false,
      getTelemetry: () => ({ schemaVersion: 1, enabled: false, noticeAcknowledged: false }),
      handlers: {},
      recordFailure,
    });
    const handler = handle.mock.calls[0]?.[1] as (
      event: { senderFrame?: { url: string }; sender: { getURL(): string } },
      value: unknown,
    ) => Promise<unknown>;
    const event = {
      senderFrame: { url: "zupulse://app/index.html" },
      sender: { getURL: () => "zupulse://app/index.html" },
    };
    const request = createBridgeRequest("app.handshake", "handshake-1", {
      appVersion: "0.1.0",
      rendererBuildHash: "b".repeat(64),
    });

    await expect(handler(event, request)).resolves.toMatchObject({ locale: { effectiveLocale: "en-US" } });
    locale = { preference: "zh-CN", effectiveLocale: "zh-CN" };
    await expect(handler(event, request)).resolves.toMatchObject({ locale: { effectiveLocale: "zh-CN" } });
    await expect(
      handler(
        { senderFrame: { url: "https://evil.example" }, sender: { getURL: () => "https://evil.example" } },
        request,
      ),
    ).rejects.toMatchObject({ code: "INVALID_BRIDGE_SENDER" });
    expect(recordFailure).toHaveBeenCalledOnce();

    server.dispose();
    expect(removeHandler).toHaveBeenCalledWith("zupulse:request");
  });
});
