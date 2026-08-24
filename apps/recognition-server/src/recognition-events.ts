import type { RecognitionJobSnapshot } from "@zupulse/web-core";

export class RecognitionEventHub {
  private readonly listeners = new Map<string, Set<(snapshot: RecognitionJobSnapshot) => void>>();

  publish(snapshot: RecognitionJobSnapshot): void {
    for (const listener of this.listeners.get(snapshot.jobId) ?? []) listener(snapshot);
  }

  subscribe(jobId: string, listener: (snapshot: RecognitionJobSnapshot) => void): () => void {
    const listeners = this.listeners.get(jobId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(jobId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(jobId);
    };
  }
}
