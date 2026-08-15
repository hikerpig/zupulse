import { BRIDGE_SCHEMA_VERSION } from "@zupulse/web-core";
import { describe, expect, it, vi } from "vitest";
import { createFileAccessModule } from "../module";

vi.mock("electron", () => ({ dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() } }));

describe("createFileAccessModule", () => {
  it("owns file handlers, validates dropped-file IPC, and clears tokens on dispose", async () => {
    const handle = vi.fn();
    const removeHandler = vi.fn();
    const recordFailure = vi.fn();
    const module = createFileAccessModule({
      getLocale: () => "en-US",
      recordFailure,
    });
    module.installDroppedFileIpc({ handle, removeHandler });

    expect(Object.keys(module.handlers).sort()).toEqual(["file.readBytes", "file.save", "file.select"]);
    expect(handle).toHaveBeenCalledOnce();
    const droppedHandler = handle.mock.calls[0]?.[1] as (
      event: { senderFrame?: { url: string }; sender: { getURL(): string } },
      value: unknown,
    ) => Promise<unknown>;
    await expect(
      droppedHandler(
        { senderFrame: { url: "https://evil.example" }, sender: { getURL: () => "https://evil.example" } },
        {
          bridgeVersion: BRIDGE_SCHEMA_VERSION,
          correlationId: "drop-1",
          type: "file.importDropped",
          payload: { paths: ["/tmp/song.gp"] },
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_BRIDGE_SENDER" });
    expect(recordFailure).toHaveBeenCalledOnce();

    const token = module.fileTokens.issue("/tmp/song.gp", { fileName: "song.gp", sizeBytes: 1 });
    module.dispose();
    expect(() => module.fileTokens.consume(token)).toThrow("FILE_TOKEN_INVALID");
    expect(removeHandler).toHaveBeenCalledWith("zupulse:file:importDropped");
  });
});
