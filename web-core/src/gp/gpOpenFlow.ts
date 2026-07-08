import type { MockNativeBridge, NativeFileBytes } from "../bridge/mockNativeBridge";
import type { Capabilities, OpenFileResponse } from "../bridge/types";
import { createViewerSession } from "../score/session";
import type { ViewerSession } from "../score/session";
import { loadGpScore, summarizeGpScore, type AlphaTabScoreLoader, type GpScoreSummary } from "./alphaTabAdapter";

export type GpOpenResult = {
  session: ViewerSession;
  summary: GpScoreSummary;
};

export async function openGpThroughBridge(input: {
  bridge: MockNativeBridge;
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
  loader?: AlphaTabScoreLoader;
}): Promise<GpOpenResult> {
  const capabilities = await input.bridge.rpc<Capabilities>("capabilities.get", {});
  const opened = await input.bridge.rpc<OpenFileResponse>("file.open", {
    fileRef: input.fileRef,
    mode: input.mode,
  });
  const file = await input.bridge.rpc<NativeFileBytes>("file.readBytes", {
    fileToken: opened.fileToken,
  });
  const session = await createViewerSession({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities,
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
