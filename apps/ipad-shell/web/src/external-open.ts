import type { ScoreImportSource } from "@zupulse/web-core";
import type { ViewerAppHandle } from "@zupulse/web-viewer";

export const externalOpenEventName = "zupulse:external-open";

type ExternalOpenDetail = {
  eventId: string;
  fileToken: string;
  fileName: string;
  sizeBytes: number;
};

type ExternalOpenReadyHandler = {
  postMessage(value: Record<string, never>): unknown;
};

export function attachExternalOpen(options: {
  target: Window;
  application: ViewerAppHandle;
  readyHandler?: ExternalOpenReadyHandler;
  fetchBytes?: typeof fetch;
}): () => void {
  const seen = new Set<string>();
  let chain = Promise.resolve();
  let detached = false;
  const listener = (event: Event) => {
    const detail = parseExternalOpenDetail((event as CustomEvent<unknown>).detail);
    if (!detail || detached || seen.has(detail.eventId)) return;
    seen.add(detail.eventId);
    chain = chain.then(async () => {
      if (detached) return;
      const source = createExternalOpenSource(detail, options.fetchBytes);
      await options.application.importScoreSources?.([source], false);
    });
  };
  options.target.addEventListener(externalOpenEventName, listener);
  options.readyHandler?.postMessage({});
  return () => {
    detached = true;
    options.target.removeEventListener(externalOpenEventName, listener);
  };
}

function createExternalOpenSource(detail: ExternalOpenDetail, fetchBytes: typeof fetch | undefined): ScoreImportSource {
  return {
    fileName: detail.fileName,
    readBytes: async () => {
      const response = await (fetchBytes ?? fetch)(`/__data/${detail.fileToken}`);
      if (!response.ok && response.status !== 0) throw new Error("IPAD_FILE_READ_FAILED");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== detail.sizeBytes) throw new Error("IPAD_FILE_SIZE_MISMATCH");
      return bytes;
    },
  };
}

function parseExternalOpenDetail(value: unknown): ExternalOpenDetail | undefined {
  if (!value || typeof value !== "object") return undefined;
  const detail = value as Partial<ExternalOpenDetail>;
  if (
    typeof detail.eventId !== "string" ||
    typeof detail.fileToken !== "string" ||
    typeof detail.fileName !== "string" ||
    typeof detail.sizeBytes !== "number" ||
    detail.sizeBytes < 0
  ) {
    return undefined;
  }
  return {
    eventId: detail.eventId,
    fileToken: detail.fileToken,
    fileName: detail.fileName,
    sizeBytes: detail.sizeBytes,
  };
}
