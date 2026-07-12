import { createBridgeEvent, type BridgeEvent } from "@tab-viewer/web-core";
import { randomUUID } from "node:crypto";

export type LifecycleState = "suspend" | "prepare-close";
export type LifecycleResult = "acknowledged" | "timed-out";

type PendingRequest = {
  promise: Promise<LifecycleResult>;
  acknowledge(): void;
};

export class DesktopLifecycleCoordinator {
  private readonly pending = new Map<LifecycleState, PendingRequest>();

  constructor(
    private readonly send: (event: BridgeEvent) => void,
    private readonly options: {
      timeoutMs: number;
      onTimeout?: (code: "LIFECYCLE_ACK_TIMEOUT", state: LifecycleState) => void;
    },
  ) {}

  request(state: LifecycleState): Promise<LifecycleResult> {
    const existing = this.pending.get(state);
    if (existing) return existing.promise;

    let acknowledge = () => undefined;
    const promise = new Promise<LifecycleResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(state);
        this.options.onTimeout?.("LIFECYCLE_ACK_TIMEOUT", state);
        resolve("timed-out");
      }, this.options.timeoutMs);
      acknowledge = () => {
        clearTimeout(timer);
        this.pending.delete(state);
        resolve("acknowledged");
      };
    });
    this.pending.set(state, { promise, acknowledge });
    this.send(createBridgeEvent("app.lifecycle", randomUUID(), { state }));
    return promise;
  }

  acknowledge(state: LifecycleState): void {
    this.pending.get(state)?.acknowledge();
  }

  prepareClose(): Promise<LifecycleResult> {
    return this.request("prepare-close");
  }
}
