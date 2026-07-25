import { ipadBridgeEventSchema } from "@zupulse/web-core";

type LifecycleApplication = {
  pauseAndFlush(): Promise<void>;
};

type LifecycleAckClient = {
  request(type: "app.lifecycleAck", payload: { state: "suspend" | "prepare-close" }): Promise<unknown>;
};

export function attachIpadLifecycle(
  target: Window,
  application: LifecycleApplication,
  bridge: LifecycleAckClient,
): () => void {
  const handledCorrelationIds = new Set<string>();

  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const parsed = ipadBridgeEventSchema.safeParse(event.detail);
    if (!parsed.success || parsed.data.type !== "app.lifecycle") return;
    const message = parsed.data;
    if (handledCorrelationIds.has(message.correlationId)) return;
    handledCorrelationIds.add(message.correlationId);

    void application
      .pauseAndFlush()
      .then(() => bridge.request("app.lifecycleAck", { state: message.payload.state }))
      .catch(() => undefined);
  };

  target.addEventListener("zupulse:bridge-event", listener);
  return () => target.removeEventListener("zupulse:bridge-event", listener);
}
