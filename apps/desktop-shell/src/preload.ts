import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { bridgeEventSchema, bridgeRequestSchema } from "@tab-viewer/web-core";

contextBridge.exposeInMainWorld("tabViewerBridge", {
  request(value: unknown): Promise<unknown> {
    return ipcRenderer.invoke("tab-viewer:request", bridgeRequestSchema.parse(value));
  },
  subscribe(listener: (event: unknown) => void): () => void {
    const handler = (_event: IpcRendererEvent, value: unknown) => {
      listener(bridgeEventSchema.parse(value));
    };
    ipcRenderer.on("tab-viewer:event", handler);
    return () => ipcRenderer.removeListener("tab-viewer:event", handler);
  },
});
