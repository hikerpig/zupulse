import { createViewerSession, type ViewerSession } from "../score/session";
import type { Capabilities, OpenFileResponse } from "./types";
import type { MockNativeBridge, NativeFileBytes } from "./mockNativeBridge";

export async function openFileThroughBridge(input: {
  bridge: MockNativeBridge;
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
}): Promise<ViewerSession> {
  const capabilities = await input.bridge.rpc<Capabilities>("capabilities.get", {});
  const opened = await input.bridge.rpc<OpenFileResponse>("file.open", {
    fileRef: input.fileRef,
    mode: input.mode,
  });
  const file = await input.bridge.rpc<NativeFileBytes>("file.readBytes", {
    fileToken: opened.fileToken,
  });

  return createViewerSession({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities,
  });
}
