import { describe, expect, it } from "vitest";
import { BrowserScoreFileGateway, createBrowserImportSources } from "../BrowserScoreFileGateway";

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

describe("BrowserScoreFileGateway", () => {
  it("resolves an empty selection when the file picker is cancelled", async () => {
    const listeners = new Map<string, EventListener>();
    const input = {
      type: "",
      multiple: false,
      accept: "",
      files: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") listeners.set(type, listener);
      },
      click: () => listeners.get("cancel")?.(new Event("cancel")),
    } as unknown as HTMLInputElement;
    const ownerDocument = {
      createElement: () => input,
    } as unknown as Document;

    await expect(new BrowserScoreFileGateway(ownerDocument).selectForImport({ multiple: true })).resolves.toEqual([]);
  });
});
