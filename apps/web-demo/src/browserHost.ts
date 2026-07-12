import { MockNativeBridge } from "@tab-viewer/web-core";
import type { ViewerFile, ViewerHost } from "@tab-viewer/web-viewer";

export function createBrowserHost(ownerDocument: Document): ViewerHost & { bridge: MockNativeBridge } {
  const bridge = new MockNativeBridge();
  return {
    bridge,
    subscribe(listener) {
      const handlePageHide = () => listener({ type: "suspend" });
      ownerDocument.defaultView?.addEventListener("pagehide", handlePageHide);
      return () => ownerDocument.defaultView?.removeEventListener("pagehide", handlePageHide);
    },
    async openScore(): Promise<ViewerFile | undefined> {
      const input = ownerDocument.createElement("input");
      input.type = "file";
      input.accept = ".gp3,.gp4,.gp5,.gpx,.gp,.musicxml,.mxl,.xml";
      const file = await new Promise<File | undefined>((resolve) => {
        input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
        input.click();
      });
      return file ? { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined;
    },
  };
}
