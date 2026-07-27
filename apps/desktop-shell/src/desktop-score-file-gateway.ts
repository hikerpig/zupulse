import {
  createBridgeRequest,
  parseBridgeResponse,
  type ScoreFileGateway,
  type ScoreImportSource,
  type StoredScoreFile,
} from "@zupulse/web-core";

type DesktopBridge = NonNullable<Window["zupulseBridge"]>;

export class DesktopScoreFileGateway implements ScoreFileGateway {
  constructor(private readonly bridge: DesktopBridge) {}

  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const request = createBridgeRequest("file.select", crypto.randomUUID(), options);
    const selection = parseBridgeResponse(request.type, await this.bridge.request(request));
    if (selection.status === "cancelled") return [];
    return selection.files.map((opened) => ({
      fileName: opened.fileName,
      readBytes: async () => {
        const read = createBridgeRequest("file.readBytes", crypto.randomUUID(), { fileToken: opened.fileToken });
        return (await parseBridgeResponse(read.type, await this.bridge.request(read))).bytes;
      },
    }));
  }

  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    const request = createBridgeRequest("file.save", crypto.randomUUID(), {
      fileName: file.fileName,
      bytes: new Uint8Array(file.bytes),
    });
    return (await parseBridgeResponse(request.type, await this.bridge.request(request))).status;
  }
}
