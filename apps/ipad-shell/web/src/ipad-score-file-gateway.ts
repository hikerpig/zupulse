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
    private readonly fetchBytes?: typeof fetch,
  ) {}

  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const result = await this.client.request("file.select", options);
    if (result.status === "cancelled") return [];
    return result.files.map((file) => ({
      fileName: file.fileName,
      readBytes: async () => {
        const url = `/__data/${file.fileToken}`;
        const bytes = this.fetchBytes ? await readWithFetch(this.fetchBytes, url) : await readWithXmlHttpRequest(url);
        if (bytes.byteLength !== file.sizeBytes) throw new Error("IPAD_FILE_SIZE_MISMATCH");
        return bytes;
      },
    }));
  }

  async saveExport(_file: StoredScoreFile): Promise<"cancelled"> {
    return "cancelled";
  }
}

async function readWithFetch(fetchBytes: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchBytes(url);
  if (!response.ok && response.status !== 0) throw new Error("IPAD_FILE_READ_FAILED");
  return new Uint8Array(await response.arrayBuffer());
}

function readWithXmlHttpRequest(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
        reject(new Error("IPAD_FILE_READ_FAILED"));
        return;
      }
      resolve(new Uint8Array(request.response as ArrayBuffer));
    };
    request.onerror = () => reject(new Error("IPAD_FILE_READ_FAILED"));
    request.send();
  });
}
