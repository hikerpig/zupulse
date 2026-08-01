import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from "electron";
import {
  BRIDGE_SCHEMA_VERSION,
  bridgeEventSchema,
  bridgeRequestSchema,
  createBridgeRequest,
  parseBridgeResponse,
  type BridgeRequest,
} from "@zupulse/web-core/bridge/schemas";
import { randomUUID } from "node:crypto";

type DroppedTokenFile = { fileToken: string; fileName: string; sizeBytes: number };
type DroppedImportResult = { ok: true; files: DroppedTokenFile[] } | { ok: false };

async function requestBridge<T extends BridgeRequest["type"]>(
  type: T,
  payload: Extract<BridgeRequest, { type: T }>["payload"],
): Promise<unknown> {
  return ipcRenderer.invoke(
    "zupulse:request",
    bridgeRequestSchema.parse({
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: randomUUID(),
      type,
      payload,
    }),
  );
}

contextBridge.exposeInMainWorld("zupulseBridge", {
  request(value: unknown): Promise<unknown> {
    return ipcRenderer.invoke("zupulse:request", bridgeRequestSchema.parse(value));
  },
  subscribe(listener: (event: unknown) => void): () => void {
    const handler = (_event: IpcRendererEvent, value: unknown) => {
      listener(bridgeEventSchema.parse(value));
    };
    ipcRenderer.on("zupulse:event", handler);
    return () => ipcRenderer.removeListener("zupulse:event", handler);
  },
  async handleDroppedFiles(files: ArrayLike<File>): Promise<DroppedImportResult> {
    const paths: string[] = [];
    for (const file of Array.from(files)) {
      const path = webUtils.getPathForFile(file);
      if (!path) return { ok: false };
      paths.push(path);
    }
    if (paths.length === 0) return { ok: false };
    const response = parseBridgeResponse("file.importDropped", await requestBridge("file.importDropped", { paths }));
    if (response.status === "cancelled") return { ok: false };
    return { ok: true, files: response.files };
  },
});
