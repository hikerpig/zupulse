// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { IpadScoreFileGateway, type IpadFileSelectionClient } from "../ipad-score-file-gateway";

describe("IpadScoreFileGateway", () => {
  it("returns token-backed import sources without exposing native paths", async () => {
    const client: IpadFileSelectionClient = {
      request: vi.fn(async () => ({
        status: "selected",
        files: [{ fileToken: "token-1", fileName: "song.musicxml", sizeBytes: 3 }],
      })),
    };
    const fetchBytes = vi.fn(async () => new Response(Uint8Array.of(1, 2, 3)));
    const gateway = new IpadScoreFileGateway(client, fetchBytes as typeof fetch);

    const sources = await gateway.selectForImport({ multiple: false });
    const source = sources[0]!;

    expect(client.request).toHaveBeenCalledWith("file.select", { multiple: false });
    expect(source).toMatchObject({ fileName: "song.musicxml" });
    expect(source).not.toHaveProperty("path");
    await expect(source.readBytes()).resolves.toEqual(Uint8Array.of(1, 2, 3));
    expect(fetchBytes).toHaveBeenCalledWith("/__data/token-1");
  });

  it("returns no sources when native selection is cancelled", async () => {
    const client: IpadFileSelectionClient = {
      request: async () => ({ status: "cancelled" }),
    };
    const gateway = new IpadScoreFileGateway(client);

    await expect(gateway.selectForImport({ multiple: true })).resolves.toEqual([]);
  });

  it("does not hide a failed or truncated token read", async () => {
    const client: IpadFileSelectionClient = {
      request: async () => ({
        status: "selected",
        files: [{ fileToken: "token-2", fileName: "score.gp", sizeBytes: 4 }],
      }),
    };
    const gateway = new IpadScoreFileGateway(
      client,
      vi.fn(async () => new Response(Uint8Array.of(1, 2), { status: 200 })) as typeof fetch,
    );
    const [source] = await gateway.selectForImport({ multiple: false });

    await expect(source!.readBytes()).rejects.toThrow("IPAD_FILE_SIZE_MISMATCH");
  });
});
