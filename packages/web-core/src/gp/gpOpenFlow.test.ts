import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "../bridge/mockNativeBridge";
import { openGpThroughBridge } from "./gpOpenFlow";

describe("openGpThroughBridge", () => {
  it("opens GP bytes through bridge and summarizes the alphaTab score", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("gp-file", {
      fileName: "song.gp5",
      bytes: new Uint8Array([1, 2, 3]),
    });

    const result = await openGpThroughBridge({
      bridge,
      handshake: { appVersion: "0.1.0", rendererBuildHash: "a".repeat(64) },
      loader: bytes => {
        expect([...bytes]).toEqual([1, 2, 3]);
        return {
          title: "Song",
          artist: "Artist",
          tracks: [{}, {}],
          masterBars: [{}, {}, {}],
          tempo: 110,
        };
      },
    });

    expect(result?.session.identity.format).toBe("gp");
    expect(result?.summary).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 110,
    });
  });

  it("rejects MIDI files before calling the GP loader", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("midi-file", {
      fileName: "song.mid",
      bytes: new Uint8Array([1, 2, 3]),
    });

    await expect(
      openGpThroughBridge({
        bridge,
        handshake: { appVersion: "0.1.0", rendererBuildHash: "a".repeat(64) },
        loader: () => {
          throw new Error("loader should not run");
        },
      }),
    ).rejects.toThrow("Expected GP score but received format: midi");
  });

  it("reads GP bytes using the file token returned by native open", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFile("external-ref", {
      fileToken: "native-token",
      fileName: "token-song.gp",
      sizeBytes: 2,
    });
    bridge.registerFileBytes("native-token", {
      fileName: "token-song.gp",
      bytes: new Uint8Array([8, 9]),
    });

    const result = await openGpThroughBridge({
      bridge,
      handshake: { appVersion: "0.1.0", rendererBuildHash: "a".repeat(64) },
      loader: bytes => {
        expect([...bytes]).toEqual([8, 9]);
        return { title: "Token Song" };
      },
    });

    expect(result?.summary.title).toBe("Token Song");
  });
});
