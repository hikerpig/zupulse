import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { bridgeEventSchema, bridgeRequestSchema } from "@zupulse/web-core/bridge/schemas";

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
});
