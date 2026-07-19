// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { AlphaTabApiLike } from "@zupulse/web-core";
import { createStudioScoreRuntime, type StudioScoreRuntimeDependencies } from "../studio-score-runtime";

describe("createStudioScoreRuntime", () => {
  it("loads an isolated alphaTab runtime without creating Viewer playback state", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div><p id="status"></p><h1 id="summary"></h1>';
    const destroy = vi.fn();
    const api: AlphaTabApiLike = { destroy };
    const dependencies: StudioScoreRuntimeDependencies = {
      createApi: vi.fn(() => api),
      presentFile: vi.fn(async () => ({
        status: "ready",
        message: "已加载",
        identity: {} as never,
        summary: {} as never,
      })),
      waitForScore: vi.fn(async () => undefined),
    };

    const runtime = await createStudioScoreRuntime(
      document,
      { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
      dependencies,
    );

    expect(dependencies.createApi).toHaveBeenCalledOnce();
    expect(dependencies.presentFile).toHaveBeenCalledOnce();
    expect(dependencies.waitForScore).toHaveBeenCalledWith(api);
    expect(runtime.getSnapshot()).toEqual({ status: "ready" });
    await runtime.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the alphaTab API when initialization fails", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div><p id="status"></p><h1 id="summary"></h1>';
    const destroy = vi.fn();
    const api: AlphaTabApiLike = { destroy };

    await expect(
      createStudioScoreRuntime(
        document,
        { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
        {
          createApi: () => api,
          presentFile: async () => {
            throw new Error("load failed");
          },
          waitForScore: async () => undefined,
        },
      ),
    ).rejects.toThrow("load failed");

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("preserves both initialization and cleanup failures", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div><p id="status"></p><h1 id="summary"></h1>';
    const api: AlphaTabApiLike = {
      destroy: () => {
        throw new Error("cleanup failed");
      },
    };

    await expect(
      createStudioScoreRuntime(
        document,
        { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
        {
          createApi: () => api,
          presentFile: async () => {
            throw new Error("load failed");
          },
          waitForScore: async () => undefined,
        },
      ),
    ).rejects.toThrow(AggregateError);
  });
});
