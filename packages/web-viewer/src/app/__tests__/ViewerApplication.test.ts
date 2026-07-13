import { describe, expect, it, vi } from "vitest";
import type { SheetLibraryRepository } from "@zupulse/web-core";
import { ViewerApplication } from "../ViewerApplication";

describe("ViewerApplication", () => {
  it("keeps cancellation on the current session and replaces a selected file", async () => {
    const destroy = vi.fn(async () => undefined);
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      undefined,
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const application = new ViewerApplication(
      { openScore: async () => files.shift(), subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy }),
    );

    await application.openScore();
    const firstSessionId = application.getSnapshot().currentSessionId;
    await application.openScore();
    expect(application.getSnapshot().currentSessionId).toBe(firstSessionId);

    await application.openScore();
    expect(application.getSnapshot().currentSessionId).not.toBe(firstSessionId);
    expect(destroy).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("coalesces concurrent opens for the same library score", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const file = { fileName: "score.gp", bytes: new Uint8Array([1]) };
    const readScore = vi.fn(async () => file);
    const openSession = vi.fn(async () => ({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy: async () => undefined,
    }));
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore,
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await Promise.all([application.openLibraryScore(scoreId), application.openLibraryScore(scoreId)]);

    expect(readScore).toHaveBeenCalledOnce();
    expect(openSession).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("does not treat the previous active session as a newly selected library score", async () => {
    const firstScoreId = "00000000-0000-4000-8000-000000000001";
    const secondScoreId = "00000000-0000-4000-8000-000000000002";
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await application.openLibraryScore(firstScoreId);
    application.selectLibraryScore(secondScoreId);

    expect(application.hasSession(secondScoreId)).toBe(false);
    await application.destroy();
  });
});
