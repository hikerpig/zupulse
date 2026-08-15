import type { LocaleState } from "@zupulse/app-i18n";
import type { Capabilities } from "@zupulse/web-core";
import { dispatchBridgeRequest, type BridgeDispatcherOptions, type BridgeHandlers } from "./dispatcher";

const BRIDGE_IPC_CHANNEL = "zupulse:request" as const;

type BridgeEvent = {
  senderFrame?: { url: string } | null;
  sender: { getURL(): string };
};
type BridgeIpc = {
  handle(channel: typeof BRIDGE_IPC_CHANNEL, handler: (event: BridgeEvent, value: unknown) => Promise<unknown>): void;
  removeHandler(channel: typeof BRIDGE_IPC_CHANNEL): void;
};

export function installBridgeServer(options: {
  ipc: BridgeIpc;
  appVersion: string;
  rendererBuildHash: string;
  capabilities: Capabilities;
  getLocale(): LocaleState;
  telemetryAvailable: boolean;
  getTelemetry(): NonNullable<BridgeDispatcherOptions["telemetry"]>;
  handlers: BridgeHandlers;
  recordFailure(error: unknown): void;
}) {
  options.ipc.handle(BRIDGE_IPC_CHANNEL, async (event, value) => {
    try {
      return await dispatchBridgeRequest(
        { senderUrl: event.senderFrame?.url ?? event.sender.getURL(), value },
        {
          appVersion: options.appVersion,
          rendererBuildHash: options.rendererBuildHash,
          locale: options.getLocale(),
          capabilities: options.capabilities,
          telemetryAvailable: options.telemetryAvailable,
          telemetry: options.getTelemetry(),
          handlers: options.handlers,
        },
      );
    } catch (error) {
      options.recordFailure(error);
      throw error;
    }
  });

  return {
    dispose(): void {
      options.ipc.removeHandler(BRIDGE_IPC_CHANNEL);
    },
  };
}
