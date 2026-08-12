import type { BridgeRequest } from "@zupulse/web-core";

type ExternalOpenRequest = Extract<BridgeRequest, { type: "external.openUrl" }>;

export async function openExternalUrl(
  request: ExternalOpenRequest,
  openExternal: (url: string) => Promise<void>,
): Promise<Record<string, never>> {
  await openExternal(request.payload.url);
  return {};
}
