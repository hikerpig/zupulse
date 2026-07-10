import { describe, expect, it } from "vitest";
import { BRIDGE_SCHEMA_VERSION, createBridgeRequest } from "@tab-viewer/web-core";
import { dispatchBridgeRequest } from "./bridge";

const rendererBuildHash = "b".repeat(64);
const validHandshake = createBridgeRequest("app.handshake", "handshake-1", {
  appVersion: "0.1.0",
  rendererBuildHash,
});

describe("dispatchBridgeRequest", () => {
  it("rejects requests from a non-app sender", async () => {
    await expect(dispatchBridgeRequest({
      senderUrl: "https://evil.example/",
      value: validHandshake,
    }, { appVersion: "0.1.0", rendererBuildHash })).rejects.toMatchObject({
      code: "INVALID_BRIDGE_SENDER",
    });
  });

  it("rejects unknown bridge messages before dispatch", async () => {
    await expect(dispatchBridgeRequest({
      senderUrl: "tab-viewer://app/index.html",
      value: { type: "fs.read", payload: {} },
    }, { appVersion: "0.1.0", rendererBuildHash })).rejects.toMatchObject({
      code: "INVALID_BRIDGE_MESSAGE",
    });
  });

  it("returns an exact validated handshake", async () => {
    await expect(dispatchBridgeRequest({
      senderUrl: "tab-viewer://app/index.html",
      value: validHandshake,
    }, { appVersion: "0.1.0", rendererBuildHash })).resolves.toMatchObject({
      appVersion: "0.1.0",
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      rendererBuildHash,
    });
  });

  it("rejects application and renderer version drift", async () => {
    await expect(dispatchBridgeRequest({
      senderUrl: "tab-viewer://app/index.html",
      value: validHandshake,
    }, { appVersion: "0.2.0", rendererBuildHash })).rejects.toMatchObject({
      code: "BRIDGE_VERSION_MISMATCH",
      recoverable: false,
    });
  });
});
