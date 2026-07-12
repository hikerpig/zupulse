import type { Capabilities } from "../bridge/types";
import { createDefaultSidecar, decodeSidecar, type SidecarPayload } from "../storage/sidecar";
import { createScoreIdentity } from "./identity";
import type { ScoreIdentity, ScoreSource } from "./types";
import type { ScoreFormat } from "./types";
import type { ImportDiagnostic } from "../import/diagnostics";

export type ViewerSession = {
  identity: ScoreIdentity;
  source: ScoreSource;
  capabilities: Capabilities;
  sidecar: SidecarPayload;
  runtime?: unknown;
  diagnostics?: ImportDiagnostic[];
  scoreCapabilities?: { view: boolean; playback: boolean };
};

export async function createViewerSession(input: {
  fileName: string;
  bytes: Uint8Array;
  capabilities: Capabilities;
  sidecarJson?: string;
  format?: ScoreFormat;
  runtime?: unknown;
  diagnostics?: ImportDiagnostic[];
  scoreCapabilities?: { view: boolean; playback: boolean };
}): Promise<ViewerSession> {
  const identity = await createScoreIdentity({
    fileName: input.fileName,
    bytes: input.bytes,
    ...(input.format === undefined ? {} : { format: input.format }),
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
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    ...(input.diagnostics === undefined ? {} : { diagnostics: input.diagnostics }),
    ...(input.scoreCapabilities === undefined ? {} : { scoreCapabilities: input.scoreCapabilities }),
  };
}
