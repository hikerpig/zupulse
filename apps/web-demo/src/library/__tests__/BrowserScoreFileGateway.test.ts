import { describe, expect, it } from "vitest";
import { createBrowserImportSources } from "../BrowserScoreFileGateway";

describe("createBrowserImportSources", () => {
  it("normalizes dropped Browser files without reading them eagerly", async () => {
    let reads = 0;
    const file = {
      name: "dropped.mxl",
      arrayBuffer: async () => {
        reads += 1;
        return new Uint8Array([7, 8, 9]).buffer;
      },
    } as File;

    const [source] = createBrowserImportSources([file]);

    expect(source?.fileName).toBe("dropped.mxl");
    expect(reads).toBe(0);
    await expect(source?.readBytes()).resolves.toEqual(new Uint8Array([7, 8, 9]));
    expect(reads).toBe(1);
  });
});
