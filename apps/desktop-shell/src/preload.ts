import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from "electron";
import {
  BRIDGE_SCHEMA_VERSION,
  bridgeEventSchema,
  bridgeRequestSchema,
  fileImportDroppedRequestSchema,
  fileImportDroppedResponseSchema,
  type FileImportDroppedRequest,
} from "@zupulse/web-core/bridge/schemas";

type DroppedTokenFile = { fileToken: string; fileName: string; sizeBytes: number };
type DroppedImportResult = { ok: true; files: DroppedTokenFile[] } | { ok: false };

const DROPPED_FILES_IPC_CHANNEL = "zupulse:file:importDropped" as const;

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
    const envelope = fileImportDroppedRequestSchema.parse({
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: crypto.randomUUID(),
      type: "file.importDropped",
      payload: { paths },
    } satisfies FileImportDroppedRequest);
    const response = fileImportDroppedResponseSchema.parse(
      await ipcRenderer.invoke(DROPPED_FILES_IPC_CHANNEL, envelope),
    );
    if (response.status === "cancelled") return { ok: false };
    return { ok: true, files: response.files };
  },
});
