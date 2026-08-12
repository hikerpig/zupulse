import { describe, expect, it, vi } from "vitest";
import { BRIDGE_SCHEMA_VERSION, createBridgeRequest } from "@zupulse/web-core";
import { dispatchBridgeRequest } from "../bridge";

const rendererBuildHash = "b".repeat(64);
const validHandshake = createBridgeRequest("app.handshake", "handshake-1", {
  appVersion: "0.1.0",
  rendererBuildHash,
});
const locale = { preference: "system" as const, effectiveLocale: "en-US" as const };

describe("dispatchBridgeRequest", () => {
  it("rejects requests from a non-app sender", async () => {
    await expect(
      dispatchBridgeRequest(
        {
          senderUrl: "https://evil.example/",
          value: validHandshake,
        },
        { appVersion: "0.1.0", rendererBuildHash, locale },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_BRIDGE_SENDER",
    });
  });

  it("rejects unknown bridge messages before dispatch", async () => {
    await expect(
      dispatchBridgeRequest(
        {
          senderUrl: "zupulse://app/index.html",
          value: { type: "fs.read", payload: {} },
        },
        { appVersion: "0.1.0", rendererBuildHash, locale },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_BRIDGE_MESSAGE",
    });
  });

  it("returns an exact validated handshake", async () => {
    await expect(
      dispatchBridgeRequest(
        {
          senderUrl: "zupulse://app/index.html",
          value: validHandshake,
        },
        { appVersion: "0.1.0", rendererBuildHash, locale },
      ),
    ).resolves.toMatchObject({
      appVersion: "0.1.0",
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      rendererBuildHash,
      locale,
      capabilities: { externalNavigation: { openUrl: true } },
    });
  });

  it("rejects application and renderer version drift", async () => {
    await expect(
      dispatchBridgeRequest(
        {
          senderUrl: "zupulse://app/index.html",
          value: validHandshake,
        },
        { appVersion: "0.2.0", rendererBuildHash, locale },
      ),
    ).rejects.toMatchObject({
      code: "BRIDGE_VERSION_MISMATCH",
      recoverable: false,
    });
  });

  it("dispatches validated external navigation requests", async () => {
    const handler = vi.fn(async () => ({}));
    const request = createBridgeRequest("external.openUrl", "external-1", {
      url: "https://github.com/hikerpig/zupulse",
    });

    await expect(
      dispatchBridgeRequest(
        { senderUrl: "zupulse://app/index.html", value: request },
        {
          appVersion: "0.1.0",
          rendererBuildHash,
          locale,
          handlers: { "external.openUrl": handler },
        },
      ),
    ).resolves.toEqual({});
    expect(handler).toHaveBeenCalledWith(request);
  });
});
