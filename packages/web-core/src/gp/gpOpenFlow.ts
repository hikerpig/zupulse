import type { BridgeHandshakeInput } from "../bridge/openFileFlow";
import { createBridgeRequest, parseBridgeResponse } from "../bridge/schemas";
import type { RpcBridge } from "../playback/playbackPersistence";
import { createViewerSession } from "../score/session";
import type { ViewerSession } from "../score/session";
import { loadGpScore, summarizeGpScore, type AlphaTabScoreLoader, type GpScoreSummary } from "./alphaTabAdapter";

export type GpOpenResult = {
  session: ViewerSession;
  summary: GpScoreSummary;
};

export async function openGpThroughBridge(input: {
  bridge: RpcBridge;
  handshake: BridgeHandshakeInput;
  loader?: AlphaTabScoreLoader;
}): Promise<GpOpenResult | undefined> {
  const handshakeRequest = createBridgeRequest("app.handshake", "gp-handshake", input.handshake);
  const handshake = parseBridgeResponse(
    handshakeRequest.type,
    await input.bridge.request(handshakeRequest),
  );
  const openRequest = createBridgeRequest("file.open", "gp-open", {});
  const opened = parseBridgeResponse(openRequest.type, await input.bridge.request(openRequest));
  if (opened.status === "cancelled") return undefined;
  const bytesRequest = createBridgeRequest("file.readBytes", "gp-read", {
    fileToken: opened.fileToken,
  });
  const file = parseBridgeResponse(bytesRequest.type, await input.bridge.request(bytesRequest));
  const session = await createViewerSession({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities: handshake.capabilities,
  });

  if (session.identity.format !== "gp") {
    throw new Error(`Expected GP score but received format: ${session.identity.format}`);
  }

  const score = loadGpScore(file.bytes, input.loader);

  return {
    session,
    summary: summarizeGpScore(score),
  };
}
