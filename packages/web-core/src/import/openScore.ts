import { createImportDiagnostic } from "./diagnostics";
import type { ImportResult, OpenScoreInput } from "./types";
import type { BridgeHandshakeInput } from "../bridge/openFileFlow";
import type { RpcBridge } from "../playback/playbackPersistence";
import { createBridgeRequest, parseBridgeResponse } from "../bridge/schemas";
import { probeScoreFormat } from "../score/formatProbe";
import { createViewerSession } from "../score/session";

export async function openScore(input: OpenScoreInput): Promise<ImportResult> {
  if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
  const probe = await probeScoreFormat(input.fileName, input.bytes);
  if (probe.status !== "confirmed") return { status: "failure", diagnostics: [probe.diagnostic] };
  const adapter = input.adapters.find((item) => item.format === probe.format);
  if (!adapter) return { status: "failure", diagnostics: [createImportDiagnostic("unsupported-format")] };
  try {
    const output = await adapter.parse({
      fileName: input.fileName,
      bytes: input.bytes,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!output.capabilities.view || output.document.tracks.length === 0 || output.document.summary.trackCount === 0) {
      return { status: "failure", diagnostics: [...output.diagnostics, createImportDiagnostic("empty-score")] };
    }
    const session = await createViewerSession({
      fileName: input.fileName,
      bytes: input.bytes,
      format: probe.format,
      capabilities: input.capabilities,
      runtime: output.runtime,
      diagnostics: output.diagnostics,
      scoreCapabilities: output.capabilities,
    });
    const document = { ...output.document, identity: session.identity, source: session.source };
    const candidate = { session, document, runtime: output.runtime };
    return {
      status: output.diagnostics.length ? "success-with-warnings" : "success",
      candidate,
      diagnostics: output.diagnostics,
    };
  } catch (cause) {
    if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
    return { status: "failure", diagnostics: [createImportDiagnostic("malformed-score")], cause };
  }
}

export async function openScoreThroughBridge(input: {
  bridge: RpcBridge;
  handshake: BridgeHandshakeInput;
  adapters: OpenScoreInput["adapters"];
  signal?: AbortSignal;
}): Promise<ImportResult | undefined> {
  const handshakeRequest = createBridgeRequest("app.handshake", "score-handshake", input.handshake);
  const handshake = parseBridgeResponse(handshakeRequest.type, await input.bridge.request(handshakeRequest));
  const openRequest = createBridgeRequest("file.open", "score-open", {});
  const opened = parseBridgeResponse(openRequest.type, await input.bridge.request(openRequest));
  if (opened.status === "cancelled") return undefined;
  const bytesRequest = createBridgeRequest("file.readBytes", "score-read", { fileToken: opened.fileToken });
  const file = parseBridgeResponse(bytesRequest.type, await input.bridge.request(bytesRequest));
  return openScore({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities: handshake.capabilities,
    adapters: input.adapters,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
