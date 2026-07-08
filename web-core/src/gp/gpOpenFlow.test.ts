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
      fileRef: "gp-file",
      mode: "external-reference",
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

    expect(result.session.identity.format).toBe("gp");
    expect(result.summary).toEqual({
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
        fileRef: "midi-file",
        mode: "external-reference",
        loader: () => {
          throw new Error("loader should not run");
        },
      }),
    ).rejects.toThrow("Expected GP score but received format: midi");
  });
});
