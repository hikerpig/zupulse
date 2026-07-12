export type ImportJob<T> = { generation: number; signal: AbortSignal; result: Promise<T | undefined>; cancel(): void };

export class ImportJobCoordinator {
  private generation = 0;
  private current?: AbortController;

  start<T>(work: (signal: AbortSignal) => Promise<T>): ImportJob<T> {
    this.current?.abort(new DOMException("Superseded", "AbortError"));
    const controller = new AbortController();
    this.current = controller;
    const generation = ++this.generation;
    const result = work(controller.signal).then(value => (
      !controller.signal.aborted && generation === this.generation ? value : undefined
    ));
    return { generation, signal: controller.signal, result, cancel: () => controller.abort(new DOMException("Cancelled", "AbortError")) };
  }

  isCurrent(generation: number): boolean { return generation === this.generation && !this.current?.signal.aborted; }
  cancelCurrent(): void { this.current?.abort(new DOMException("Cancelled", "AbortError")); }
}
