// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { AlphaTabApiLike } from "@zupulse/web-core";
import { SCORE_ZOOM_COMMIT_EVENT } from "../scoreZoom";
import { createStudioScoreRuntime, type StudioScoreRuntimeDependencies } from "../studio-score-runtime";

function testEvent<T>() {
  const handlers = new Set<(value: T) => void>();
  return {
    event: {
      on(handler: (value: T) => void) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    },
    emit(value: T) {
      for (const handler of handlers) handler(value);
    },
    size: () => handlers.size,
  };
}

describe("createStudioScoreRuntime", () => {
  it("loads an isolated alphaTab runtime without creating Viewer playback state", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div><p id="status"></p><h1 id="summary"></h1>';
    const destroy = vi.fn();
    const api: AlphaTabApiLike = { destroy };
    const dependencies: StudioScoreRuntimeDependencies = {
      createApi: vi.fn(() => api),
      presentFile: vi.fn(async () => ({
        status: "ready",
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
    expect(runtime.getSnapshot()).toEqual({
      status: "ready",
      transport: { status: "paused", positionTicks: 0, speed: 1 },
      audio: "unavailable",
    });
    await runtime.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("reports soundfont and stopped states and detaches every listener on destroy", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div>';
    const playerState = testEvent<unknown>();
    const soundFontLoad = testEvent<unknown>();
    const soundFontLoaded = testEvent<void>();
    const error = testEvent<unknown>();
    const destroy = vi.fn();
    const api = {
      destroy,
      playPause: vi.fn(),
      playerStateChanged: playerState.event,
      soundFontLoad: soundFontLoad.event,
      soundFontLoaded: soundFontLoaded.event,
      error: error.event,
    } as unknown as AlphaTabApiLike;
    const runtime = await createStudioScoreRuntime(
      document,
      { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
      {
        createApi: () => api,
        presentFile: async () => ({ status: "ready", identity: {} as never, summary: {} as never }),
        waitForScore: async () => undefined,
      },
    );
    const audioStates: string[] = [];
    runtime.subscribeAudio?.((audio) => audioStates.push(audio));

    expect(runtime.getSnapshot().audio).toBe("loading");
    error.emit(new Error("soundfont failed"));
    expect(runtime.getSnapshot().audio).toBe("error");
    soundFontLoad.emit({ loaded: 1, total: 2 });
    soundFontLoaded.emit();
    playerState.emit({ state: 0, stopped: true });
    expect(runtime.getSnapshot()).toMatchObject({ audio: "ready", transport: { status: "stopped" } });
    expect(audioStates).toEqual(["error", "loading", "ready"]);

    await runtime.destroy();
    expect(playerState.size()).toBe(0);
    expect(soundFontLoad.size()).toBe(0);
    expect(soundFontLoaded.size()).toBe(0);
    expect(error.size()).toBe(0);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("applies the persisted zoom and stops consuming zoom commits after destroy", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab" data-score-zoom="1.25"></section></div>';
    const updateSettings = vi.fn();
    const api = {
      settings: { display: { scale: 1.25 } },
      updateSettings,
      destroy: vi.fn(),
    } as unknown as AlphaTabApiLike;
    const createApi = vi.fn((_host: HTMLElement, _settings: unknown) => api);
    const runtime = await createStudioScoreRuntime(
      document,
      { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
      {
        createApi,
        presentFile: async () => ({ status: "ready", identity: {} as never, summary: {} as never }),
        waitForScore: async () => undefined,
      },
    );

    expect(createApi.mock.calls[0]?.[1]).toMatchObject({ display: { scale: 1.25 } });

    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.4 } }));
    expect(api.settings?.display?.scale).toBe(1.4);
    expect(updateSettings).toHaveBeenCalledOnce();

    await runtime.destroy();
    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.5 } }));
    expect(updateSettings).toHaveBeenCalledOnce();
  });

  it("waits for alphaTab to confirm playback before reporting a playing transport", async () => {
    document.body.innerHTML = '<div><section id="alpha-tab"></section></div>';
    const playerState = testEvent<unknown>();
    const playPause = vi.fn();
    const api = {
      playPause,
      playerStateChanged: playerState.event,
    } as unknown as AlphaTabApiLike;
    const runtime = await createStudioScoreRuntime(
      document,
      { fileName: "score.musicxml", bytes: new Uint8Array([1]) },
      {
        createApi: () => api,
        presentFile: async () => ({ status: "ready", identity: {} as never, summary: {} as never }),
        waitForScore: async () => undefined,
      },
    );

    expect(runtime.togglePlayback()).toEqual({ status: "toggled" });
    expect(playPause).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().transport.status).toBe("paused");

    playerState.emit({ state: 1 });
    expect(runtime.getSnapshot().transport.status).toBe("playing");
    await runtime.destroy();
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
