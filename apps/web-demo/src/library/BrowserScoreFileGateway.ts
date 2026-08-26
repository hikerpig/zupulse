import type { ScoreFileGateway, ScoreImportSource, StoredScoreFile } from "@zupulse/web-core";
import { pickFiles, saveBytes } from "./browser-file-transfer";

const importAccept = ".gp3,.gp4,.gp5,.gpx,.gp,.musicxml,.mxl";

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
    const files = await pickFiles(this.ownerDocument, { accept: importAccept, multiple: options.multiple });
    return createBrowserImportSources(files, "picker");
  }
  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    saveBytes(this.ownerDocument, { fileName: file.fileName, bytes: file.bytes });
    return "saved";
  }
}
