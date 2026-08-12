import { createBridgeRequest, parseBridgeResponse } from "@zupulse/web-core";
import type { ExternalNavigationHost } from "@zupulse/web-viewer";

type DesktopBridge = NonNullable<Window["zupulseBridge"]>;

export function createDesktopExternalNavigation(bridge: DesktopBridge): ExternalNavigationHost {
  return {
    async openExternalUrl(url) {
      const request = createBridgeRequest("external.openUrl", crypto.randomUUID(), { url });
      parseBridgeResponse(request.type, await bridge.request(request));
    },
  };
}
