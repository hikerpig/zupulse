import type { ScoreFileGateway, ScoreImportSource, StoredScoreFile } from "@zupulse/web-core";

export function createBrowserImportSources(files: readonly File[]): readonly ScoreImportSource[] {
  return files.map((file) => ({
    fileName: file.name,
    readBytes: async () => new Uint8Array(await file.arrayBuffer()),
  }));
}

export class BrowserScoreFileGateway implements ScoreFileGateway {
  constructor(private readonly ownerDocument: Document) {}
  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const input = this.ownerDocument.createElement("input");
    input.type = "file";
    input.multiple = options.multiple;
    input.accept = ".gp3,.gp4,.gp5,.gpx,.gp,.musicxml,.mxl";
    const files = await new Promise<readonly File[]>((resolve) => {
      input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
      input.addEventListener("cancel", () => resolve([]), { once: true });
      input.click();
    });
    return createBrowserImportSources(files);
  }
  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    const link = this.ownerDocument.createElement("a");
    link.href = URL.createObjectURL(new Blob([file.bytes.slice().buffer]));
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    return "saved";
  }
}
