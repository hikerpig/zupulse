import type { ScoreFileGateway, ScoreImportSource, StoredScoreFile } from "@zupulse/web-core";

type FileSelectionResult =
  | { status: "cancelled" }
  | {
      status: "selected";
      files: Array<{ fileToken: string; fileName: string; sizeBytes: number }>;
    };

export type IpadFileSelectionClient = {
  request(type: "file.select", payload: { multiple: boolean }): Promise<FileSelectionResult>;
};

export class IpadScoreFileGateway implements ScoreFileGateway {
  constructor(
    private readonly client: IpadFileSelectionClient,
    private readonly fetchBytes: typeof fetch = fetch,
  ) {}

  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const result = await this.client.request("file.select", options);
    if (result.status === "cancelled") return [];
    return result.files.map((file) => ({
      fileName: file.fileName,
      readBytes: async () => {
        const response = await this.fetchBytes(`zupulse-data://file/${file.fileToken}`);
        if (!response.ok && response.status !== 0) throw new Error("IPAD_FILE_READ_FAILED");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== file.sizeBytes) throw new Error("IPAD_FILE_SIZE_MISMATCH");
        return bytes;
      },
    }));
  }

  async saveExport(_file: StoredScoreFile): Promise<"cancelled"> {
    return "cancelled";
  }
}
