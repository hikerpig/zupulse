import type { ScoreFileGateway, ScoreImportSource, StoredScoreFile } from "@zupulse/web-core";

export function createBrowserImportSources(
  files: readonly File[],
  telemetrySource: "picker" | "drop" = "drop",
): readonly ScoreImportSource[] {
  return files.map((file) => ({
    fileName: file.name,
    readBytes: async () => new Uint8Array(await file.arrayBuffer()),
    telemetrySource,
  }));
}

export class BrowserScoreFileGateway implements ScoreFileGateway {
  constructor(private readonly ownerDocument: Document) {}
  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const input = this.ownerDocument.createElement("input");
    input.type = "file";
    input.multiple = options.multiple;
    input.accept = ".gp3,.gp4,.gp5,.gpx,.gp,.musicxml,.mxl";
    // Detached file inputs fail to open the picker in some engines; keep the input in the DOM until settled.
    input.style.display = "none";
    this.ownerDocument.body.appendChild(input);
    try {
      const files = await new Promise<readonly File[]>((resolve) => {
        input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
        input.addEventListener("cancel", () => resolve([]), { once: true });
        input.click();
      });
      return createBrowserImportSources(files, "picker");
    } finally {
      input.remove();
    }
  }
  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    const link = this.ownerDocument.createElement("a");
    const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer]));
    link.href = url;
    link.download = file.fileName;
    // Detached anchors fail to trigger downloads in some engines.
    link.style.display = "none";
    this.ownerDocument.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking the blob URL synchronously after click() can abort the download; defer it briefly.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "saved";
  }
}
