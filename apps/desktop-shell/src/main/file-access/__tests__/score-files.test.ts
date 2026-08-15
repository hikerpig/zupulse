import { describe, expect, it, vi } from "vitest";
import { FileTokenStore } from "../file-token-store";
import { MAX_SCORE_BYTES, assertReadableScore, readScoreFileBytes } from "../score-files";

vi.mock("electron", () => ({ dialog: { showOpenDialog: vi.fn() } }));

describe("desktop score files", () => {
  it("rejects oversized and non-file selections without trusting extensions", () => {
    expect(() =>
      assertReadableScore({
        fileName: "huge.gp",
        sizeBytes: MAX_SCORE_BYTES + 1,
        isFile: true,
      }),
    ).toThrow("FILE_TOO_LARGE");
    expect(() => assertReadableScore({ fileName: "folder.gp", sizeBytes: 1, isFile: false })).toThrow(
      "FILE_NOT_REGULAR",
    );
    expect(() => assertReadableScore({ fileName: "disguised.exe", sizeBytes: 1, isFile: true })).not.toThrow();
  });

  it("reads a one-time token and rejects a reused token", async () => {
    const store = new FileTokenStore();
    const token = store.issue("/private/song.gp5", { fileName: "song.gp5", sizeBytes: 3 });

    await expect(readScoreFileBytes(store, token, async () => Buffer.from([1, 2, 3]))).resolves.toEqual({
      fileName: "song.gp5",
      bytes: new Uint8Array([1, 2, 3]),
    });
    await expect(readScoreFileBytes(store, token, async () => Buffer.from([1]))).rejects.toThrow("FILE_TOKEN_INVALID");
  });

  it("rechecks the size after reading to close the selection race", async () => {
    const store = new FileTokenStore();
    const token = store.issue("/private/song.gp", { fileName: "song.gp", sizeBytes: 1 });
    await expect(readScoreFileBytes(store, token, async () => Buffer.alloc(MAX_SCORE_BYTES + 1))).rejects.toThrow(
      "FILE_TOO_LARGE",
    );
  });
});
