import { describe, expect, it } from "vitest";
import { ImportJobCoordinator } from "./importJob";

describe("ImportJobCoordinator", () => {
  it("drops a slow old result after a newer intent completes", async () => {
    const coordinator = new ImportJobCoordinator();
    let resolveOld!: (value: string) => void;
    const old = coordinator.start(() => new Promise(resolve => { resolveOld = resolve; }));
    const current = coordinator.start(async () => "new");
    await expect(current.result).resolves.toBe("new");
    resolveOld("old");
    await expect(old.result).resolves.toBeUndefined();
  });
});
