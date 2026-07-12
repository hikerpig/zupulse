import { describe, expect, it } from "vitest";
import {
  BRIDGE_SCHEMA_VERSION,
  bridgeRequestSchema,
  bridgeResponseSchemas,
  capabilitiesSchema,
  createBridgeRequest,
  parseBridgeResponse,
} from "../schemas";

const hash = "a".repeat(64);

describe("bridge schemas", () => {
  it("rejects unknown message types", () => {
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "electron.send",
        payload: {},
      }),
    ).toThrow();
  });

  it("rejects additional envelope and payload fields", () => {
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "file.open",
        payload: { fileRef: "legacy" },
      }),
    ).toThrow();
    expect(() =>
      bridgeRequestSchema.parse({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "x",
        type: "file.open",
        payload: {},
        channel: "legacy",
      }),
    ).toThrow();
  });

  it("models temporary file access without platform mechanisms", () => {
    expect(
      capabilitiesSchema.parse({
        fileAccess: {
          openExternalFile: true,
          persistentFileReferences: false,
          localLibraryImport: false,
        },
        storage: { sqliteIndex: false, sidecarPayload: true },
        sync: { available: false, provider: "none" },
        audio: { webAudio: true, nativeBridge: false },
      }).fileAccess.persistentFileReferences,
    ).toBe(false);
  });

  it("creates typed envelopes and parses the response selected by request type", () => {
    expect(createBridgeRequest("file.open", "open-1", {})).toEqual({
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: "open-1",
      type: "file.open",
      payload: {},
    });
    expect(parseBridgeResponse("file.open", { status: "cancelled" })).toEqual({
      status: "cancelled",
    });
    expect(() =>
      parseBridgeResponse("file.open", {
        status: "opened",
        fileToken: "token",
        fileName: "score.gp",
        sizeBytes: 3,
        legacyPath: "/tmp/score.gp",
      }),
    ).toThrow();
  });

  it("validates handshake and byte responses", () => {
    expect(
      bridgeResponseSchemas["app.handshake"].parse({
        appVersion: "0.1.0",
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        rendererBuildHash: hash,
        capabilities: {
          fileAccess: {
            openExternalFile: true,
            persistentFileReferences: false,
            localLibraryImport: false,
          },
          storage: { sqliteIndex: false, sidecarPayload: true },
          sync: { available: false, provider: "none" },
          audio: { webAudio: true, nativeBridge: false },
        },
      }).rendererBuildHash,
    ).toBe(hash);
    expect(
      bridgeResponseSchemas["file.readBytes"].parse({
        fileName: "score.gp",
        bytes: new Uint8Array([1]),
      }).bytes,
    ).toBeInstanceOf(Uint8Array);
  });

  it("round-trips MusicXML identities through sidecar requests", () => {
    const identity = {
      contentHash: hash,
      format: "musicxml" as const,
      sourceHints: { fileName: "score.musicxml", trackNames: ["Piano"] },
    };
    expect(createBridgeRequest("sidecar.read", "sidecar-1", { identity }).payload.identity).toEqual(identity);
  });
});
