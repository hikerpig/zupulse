import type { RpcBridge } from "../playback/playbackPersistence";
import { createViewerSession, type ViewerSession } from "../score/session";
import { createBridgeRequest, parseBridgeResponse } from "./schemas";

export type BridgeHandshakeInput = {
  appVersion: string;
  rendererBuildHash: string;
};

export async function openFileThroughBridge(input: {
  bridge: RpcBridge;
  handshake: BridgeHandshakeInput;
}): Promise<ViewerSession | undefined> {
  const handshakeRequest = createBridgeRequest("app.handshake", "open-handshake", input.handshake);
  const handshake = parseBridgeResponse(
    handshakeRequest.type,
    await input.bridge.request(handshakeRequest),
  );
  const openRequest = createBridgeRequest("file.open", "open-file", {});
  const opened = parseBridgeResponse(openRequest.type, await input.bridge.request(openRequest));
  if (opened.status === "cancelled") return undefined;

  const bytesRequest = createBridgeRequest("file.readBytes", "read-file", {
    fileToken: opened.fileToken,
  });
  const file = parseBridgeResponse(bytesRequest.type, await input.bridge.request(bytesRequest));

  return createViewerSession({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities: handshake.capabilities,
  });
}
