import { describe, expect, it, vi } from "vitest";
import { DesktopScoreFileGateway } from "../desktop-score-file-gateway";

describe("DesktopScoreFileGateway", () => {
  it("consumes one-time file tokens before returning review candidates", async () => {
    const request = vi.fn(async (value: unknown) => {
      const message = value as { type: string };
      if (message.type === "file.select") {
        return {
          status: "selected",
          files: [{ fileToken: "token-1", fileName: "reviewed.mxl", sizeBytes: 3 }],
        };
      }
      if (message.type === "file.readBytes") {
        return { fileName: "reviewed.mxl", bytes: new Uint8Array([1, 2, 3]) };
      }
      throw new Error(`Unexpected request: ${message.type}`);
    });
    const gateway = new DesktopScoreFileGateway({
      request,
      subscribe: vi.fn(),
    });

    const [source] = await gateway.selectForImport({ multiple: true });

    expect(request.mock.calls.map(([message]) => (message as { type: string }).type)).toEqual([
      "file.select",
      "file.readBytes",
    ]);
    await expect(source?.readBytes()).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
