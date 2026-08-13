import {
  createBridgeRequest,
  parseBridgeResponse,
  type ScoreFileGateway,
  type ScoreImportSource,
  type StoredScoreFile,
} from "@zupulse/web-core";

type DesktopBridge = NonNullable<Window["zupulseBridge"]>;

type TokenFile = { fileToken: string; fileName: string; sizeBytes: number };
type DroppedTokenFiles = { ok: true; files: TokenFile[] } | { ok: false };

export class DesktopScoreFileGateway implements ScoreFileGateway {
  constructor(private readonly bridge: DesktopBridge) {}

  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const request = createBridgeRequest("file.select", crypto.randomUUID(), options);
    const selection = parseBridgeResponse(request.type, await this.bridge.request(request));
    if (selection.status === "cancelled") return [];
    return readTokensAsImportSources(this.bridge, selection.files, "picker");
  }

  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    const request = createBridgeRequest("file.save", crypto.randomUUID(), {
      fileName: file.fileName,
      bytes: new Uint8Array(file.bytes),
    });
    return (await parseBridgeResponse(request.type, await this.bridge.request(request))).status;
  }
}

async function readTokensAsImportSources(
  bridge: DesktopBridge,
  entries: readonly TokenFile[],
  source: "picker" | "drop",
): Promise<readonly ScoreImportSource[]> {
  return Promise.all(
    entries.map(async (opened) => {
      const read = createBridgeRequest("file.readBytes", crypto.randomUUID(), { fileToken: opened.fileToken });
      const file = parseBridgeResponse(read.type, await bridge.request(read));
      return {
        fileName: file.fileName,
        readBytes: async () => new Uint8Array(file.bytes),
        telemetrySource: source,
      };
    }),
  );
}

export async function createDesktopDroppedImportSources(
  bridge: DesktopBridge,
  files: readonly File[],
): Promise<readonly ScoreImportSource[]> {
  const handle = bridge.handleDroppedFiles;
  if (!handle || files.length === 0) return [];
  const result: DroppedTokenFiles = await handle(files);
  if (!result.ok) return [];
  return readTokensAsImportSources(bridge, result.files, "drop");
}
