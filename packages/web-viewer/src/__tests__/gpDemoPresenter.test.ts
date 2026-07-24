// Migrated with the shared GP presenter.
import { describe, expect, it } from "vitest";
import { presentGpFile } from "../gpDemoPresenter";

describe("presentGpFile", () => {
  it("rejects non-GP files", async () => {
    const state = await presentGpFile({
      file: fileLike("lesson.mid", new Uint8Array([1])),
      api: {},
      loader: () => ({ title: "Should not load" }),
    });

    expect(state).toEqual({
      status: "error",
      issueCode: "gp-file-required",
    });
  });

  it("loads GP bytes into alphaTab and returns summary", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const state = await presentGpFile({
      file: fileLike("song.gp5", bytes),
      api: {
        load(scoreData: unknown) {
          expect(scoreData).toEqual(bytes);
          return true;
        },
      },
      loader: (input) => {
        expect(input).toEqual(bytes);
        return {
          title: "Song",
          artist: "Artist",
          tracks: [{ name: "Lead" }, { name: "Bass" }],
          masterBars: [{}, {}, {}],
          tempo: 120,
        };
      },
    });

    expect(state.status).toBe("ready");
    expect(state.summary).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 120,
    });
    expect(state.identity?.format).toBe("gp");
    expect(state.identity?.sourceHints?.trackNames).toEqual(["Lead", "Bass"]);
    expect(state.bytes).toEqual(bytes);
    expect(state.score?.title).toBe("Song");
  });

  it("reports an error when alphaTab refuses the bytes", async () => {
    const state = await presentGpFile({
      file: fileLike("broken.gp", new Uint8Array([9])),
      api: {
        load() {
          return false;
        },
      },
      loader: () => ({ title: "Broken" }),
    });

    expect(state).toEqual({
      status: "error",
      issueCode: "alpha-tab-load-failed",
    });
  });
});

function fileLike(name: string, bytes: Uint8Array) {
  return {
    name,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}
