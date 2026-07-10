import type { Capabilities } from "../bridge/types";
import { createDefaultSidecar, decodeSidecar, type SidecarPayload } from "../storage/sidecar";
import { createScoreIdentity } from "./identity";
import type { ScoreIdentity, ScoreSource } from "./types";

export type ViewerSession = {
  identity: ScoreIdentity;
  source: ScoreSource;
  capabilities: Capabilities;
  sidecar: SidecarPayload;
};

export async function createViewerSession(input: {
  fileName: string;
  bytes: Uint8Array;
  capabilities: Capabilities;
  sidecarJson?: string;
}): Promise<ViewerSession> {
  const identity = await createScoreIdentity({
    fileName: input.fileName,
    bytes: input.bytes,
  });

  return {
    identity,
    source: {
      fileName: input.fileName,
      sizeBytes: input.bytes.byteLength,
      format: identity.format,
    },
    capabilities: input.capabilities,
    sidecar: input.sidecarJson === undefined ? createDefaultSidecar(identity) : decodeSidecar(input.sidecarJson),
  };
}
