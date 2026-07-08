import { openFileThroughBridge } from "../bridge/openFileFlow";
import type { MockNativeBridge } from "../bridge/mockNativeBridge";
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
  const session = await openFileThroughBridge({
    bridge: input.bridge,
    fileRef: input.fileRef,
    mode: input.mode,
  });

  if (session.identity.format !== "gp") {
    throw new Error(`Expected GP score but received format: ${session.identity.format}`);
  }

  const file = await input.bridge.rpc<{ bytes: Uint8Array }>("file.readBytes", {
    fileToken: input.fileRef,
  });
  const score = loadGpScore(file.bytes, input.loader);

  return {
    session,
    summary: summarizeGpScore(score),
  };
}
