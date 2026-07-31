// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachScoreZoomCommit,
  createDefaultOpenSession,
  transportEnteredStopped,
  renderViewerState,
  type DefaultOpenSessionDependencies,
} from "../viewerApp";
import { SCORE_ZOOM_COMMIT_EVENT } from "../scoreZoom";
import { mountViewerApp } from "../mountViewerApp";
import type { ViewerDomBindings } from "../host";

function renderSessionFixture(ownerDocument: Document): void {
  ownerDocument.body.innerHTML =
    '<h1 id="summary">未打开乐谱</h1><p id="status"></p><div><section id="alpha-tab"></section></div>';
}

function sessionBindings(ownerDocument: Document): ViewerDomBindings {
  const alphaTabHost = ownerDocument.querySelector<HTMLElement>("#alpha-tab")!;
  return {
    alphaTabHost,
    scoreScrollElement: alphaTabHost.parentElement!,
    status: ownerDocument.querySelector<HTMLElement>("#status")!,
    summary: ownerDocument.querySelector<HTMLElement>("#summary")!,
  };
}

function testRoot(): HTMLElement {
  document.body.innerHTML = '<div id="root"></div>';
  return document.getElementById("root") as HTMLElement;
}

async function openScoreButton(): Promise<HTMLButtonElement> {
  let button: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    button = document.querySelector<HTMLButtonElement>("#open-score");
    expect(button).not.toBeNull();
  });
  return button!;
}

describe("mountViewerApp", () => {
  beforeEach(() => {
    // Hosts without a library fall back to the demo viewer on the Library route.
    window.history.replaceState(null, "", "#/library");
  });

  it("switches between dark and light theme", async () => {
    renderSessionFixture(document);

    const handle = mountViewerApp(testRoot(), {
      host: { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: vi.fn(),
      }),
    });

    expect(document.documentElement.dataset.theme).toBe("dark");

    document
      .querySelector<HTMLButtonElement>('button[aria-label="切换至浅色主题"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe("light");

    document
      .querySelector<HTMLButtonElement>('button[aria-label="切换至深色主题"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await handle.destroy();
  });

  it("forwards toggle-playback host commands to the active session", async () => {
    renderSessionFixture(document);
    let hostListener: ((event: { type: "toggle-playback" }) => void) | undefined;
    const togglePlayback = vi.fn(async () => undefined);
    const app = mountViewerApp(testRoot(), {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: (listener) => {
          hostListener = listener as typeof hostListener;
          return () => undefined;
        },
      },
      openSession: async () => ({
        togglePlayback,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
    });
    await app.openScore();

    hostListener?.({ type: "toggle-playback" });
    await vi.waitFor(() => expect(togglePlayback).toHaveBeenCalledOnce());
  });

  it("opens through the injected host and destroys the active session", async () => {
    renderSessionFixture(document);
    const openScore = vi.fn(async () => ({
      fileName: "song.gp5",
      bytes: new Uint8Array([1]),
    }));
    const destroySession = vi.fn(async () => undefined);
    const app = mountViewerApp(testRoot(), {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({
        destroy: destroySession,
        pauseAndFlush: vi.fn(),
        togglePlayback: vi.fn(),
      }),
    });

    (await openScoreButton()).click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledOnce());
    await app.destroy();
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("destroys the previous session before opening the next score", async () => {
    renderSessionFixture(document);
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const order: string[] = [];
    let session = 0;
    const app = mountViewerApp(testRoot(), {
      host: { openScore: async () => files.shift(), subscribe: () => () => undefined },
      openSession: async () => {
        const current = ++session;
        order.push(`start-${current}`);
        return {
          togglePlayback: async () => undefined,
          pauseAndFlush: async () => undefined,
          destroy: async () => {
            order.push(`destroy-${current}`);
          },
        };
      },
    });

    await app.openScore();
    await app.openScore();
    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);
  });

  it("serializes concurrent public openScore calls and retains only the latest session", async () => {
    renderSessionFixture(document);
    const firstSessionGate = deferred<void>();
    const order: string[] = [];
    let session = 0;
    const hostOpen = vi.fn(async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }));
    const app = mountViewerApp(testRoot(), {
      host: { openScore: hostOpen, subscribe: () => () => undefined },
      openSession: async () => {
        const current = ++session;
        order.push(`start-${current}`);
        if (current === 1) await firstSessionGate.promise;
        return {
          togglePlayback: async () => undefined,
          pauseAndFlush: async () => undefined,
          destroy: async () => {
            order.push(`destroy-${current}`);
          },
        };
      },
    });

    const firstOpen = app.openScore();
    const secondOpen = app.openScore();
    await vi.waitFor(() => expect(order).toEqual(["start-1"]));
    expect(hostOpen).toHaveBeenCalledOnce();

    firstSessionGate.resolve();
    await Promise.all([firstOpen, secondOpen]);
    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);

    await app.destroy();
    expect(order).toEqual(["start-1", "destroy-1", "start-2", "destroy-2"]);
  });

  it("rejects new opens after destroy starts and cleans an already accepted open", async () => {
    renderSessionFixture(document);
    const sessionGate = deferred<void>();
    const destroySession = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => {
      await sessionGate.promise;
      return { togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: destroySession };
    });
    const app = mountViewerApp(testRoot(), {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: () => () => undefined,
      },
      openSession,
    });

    const acceptedOpen = app.openScore();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    const destroying = app.destroy();
    await expect(app.openScore()).rejects.toThrow("Viewer app is being destroyed");

    sessionGate.resolve();
    await acceptedOpen;
    await destroying;
    expect(openSession).toHaveBeenCalledOnce();
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("continues the queued open flow after openSession rejects", async () => {
    renderSessionFixture(document);
    const openSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("first open failed"))
      .mockResolvedValueOnce({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() });
    const app = mountViewerApp(testRoot(), {
      host: {
        openScore: async () => ({ fileName: "song.gp5", bytes: new Uint8Array([1]) }),
        subscribe: () => () => undefined,
      },
      openSession,
    });
    const button = await openScoreButton();

    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledTimes(1));
    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledTimes(2));

    await app.destroy();
  });

  it("continues the queued open flow after the host rejects", async () => {
    renderSessionFixture(document);
    const openScore = vi
      .fn()
      .mockRejectedValueOnce(new Error("picker failed"))
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) });
    const openSession = vi.fn(async () => ({
      togglePlayback: vi.fn(),
      pauseAndFlush: vi.fn(),
      destroy: vi.fn(),
    }));
    const app = mountViewerApp(testRoot(), {
      host: { openScore, subscribe: () => () => undefined },
      openSession,
    });
    const button = await openScoreButton();

    button.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(1));
    button.click();
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());

    await app.destroy();
  });

  it("clears a queued UI error after a successful public open", async () => {
    renderSessionFixture(document);
    const openScore = vi
      .fn()
      .mockRejectedValueOnce(new Error("picker failed"))
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) });
    const app = mountViewerApp(testRoot(), {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: vi.fn(),
      }),
    });

    (await openScoreButton()).click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledOnce());
    await app.openScore();

    await expect(app.destroy()).resolves.toBeUndefined();
  });

  it("clears a previous session reference before awaiting its failing destroy", async () => {
    renderSessionFixture(document);
    const failure = new Error("session cleanup failed");
    const destroySession = vi.fn(async () => {
      throw failure;
    });
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const app = mountViewerApp(testRoot(), {
      host: { openScore: async () => files.shift(), subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: destroySession,
      }),
    });
    await app.openScore();

    await expect(app.openScore()).rejects.toBe(failure);
    await app.destroy();

    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("cleans the active session before propagating a queued host failure from destroy", async () => {
    renderSessionFixture(document);
    const failure = new Error("host failed");
    const destroySession = vi.fn(async () => undefined);
    const openScore = vi
      .fn()
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) })
      .mockRejectedValueOnce(failure);
    const app = mountViewerApp(testRoot(), {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: destroySession,
      }),
    });
    await app.openScore();

    (await openScoreButton()).click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(2));

    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
    await expect(app.destroy()).rejects.toBe(failure);
    expect(destroySession).toHaveBeenCalledOnce();
  });

  it("aggregates queued open and active cleanup failures during destroy", async () => {
    renderSessionFixture(document);
    const openFailure = new Error("host failed");
    const cleanupFailure = new Error("session destroy failed");
    const openScore = vi
      .fn()
      .mockResolvedValueOnce({ fileName: "song.gp5", bytes: new Uint8Array([1]) })
      .mockRejectedValueOnce(openFailure);
    const app = mountViewerApp(testRoot(), {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({
        togglePlayback: vi.fn(),
        pauseAndFlush: vi.fn(),
        destroy: async () => {
          throw cleanupFailure;
        },
      }),
    });
    await app.openScore();
    (await openScoreButton()).click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledTimes(2));

    const error = (await rejectionOf(app.destroy())) as AggregateError;

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([openFailure, cleanupFailure]);
  });
});

describe("transport navigation transitions", () => {
  it("restores following only when transport enters stopped", () => {
    expect(transportEnteredStopped("playing", "stopped")).toBe(true);
    expect(transportEnteredStopped("paused", "stopped")).toBe(true);
    expect(transportEnteredStopped("stopped", "stopped")).toBe(false);
    expect(transportEnteredStopped("stopped", "playing")).toBe(false);
  });
});

describe("createDefaultOpenSession cleanup", () => {
  it("maps a score beat selection to the existing written playback position without toggling playback", async () => {
    renderSessionFixture(document);
    let beatHandler: ((beat: { displayStart: number; voice: { bar: { index: number } } }) => void) | undefined;
    let detached = false;
    const dispatch = vi.fn(async () => undefined);
    const previewSeek = vi.fn();
    const api = {
      beatMouseDown: {
        on(handler: typeof beatHandler) {
          beatHandler = handler;
          return () => {
            detached = true;
          };
        },
      },
    };
    const openSession = createDefaultOpenSession(document, {} as never, {
      createApi: () => api,
      createAdapter: () => ({ destroy: vi.fn() }) as never,
      presentFile: async () => ({
        status: "ready",
        message: "已加载 Song",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 2 },
      }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: {
          durationTicks: 3840,
          durationMs: 4000,
          measures: [
            { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
            {
              id: "measure-1",
              index: 1,
              startTick: 1920,
              durationTicks: 1920,
              beatTicks: [1920, 2400, 2880, 3360],
            },
          ],
        },
      }),
      createController: () =>
        ({
          initialize: async () => undefined,
          getState: () => ({
            sessionId: "session",
            transport: "playing",
            position: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
          }),
          subscribe: () => () => undefined,
          dispatch,
          previewSeek,
          flush: async () => undefined,
          destroy: async () => undefined,
        }) as never,
    });
    const session = await openSession(
      { fileName: "song.gp5", bytes: new Uint8Array([1]) },
      undefined,
      sessionBindings(document),
    );
    const previewPosition = {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 1,
      tick: 480,
      cachedTimeMs: 500,
    };

    session.playback?.previewSeek?.(previewPosition);
    expect(previewSeek).toHaveBeenCalledWith(previewPosition);

    beatHandler?.({ displayStart: 480, voice: { bar: { index: 1 } } });
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "seek",
        position: {
          measureId: "measure-1",
          measureIndex: 1,
          beatIndex: 1,
          tick: 2400,
          cachedTimeMs: 2500,
        },
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "toggle-playback" });

    await session.destroy();
    expect(detached).toBe(true);
  });

  it("commits alphaTab scale once and falls back to the relative scroll position without score bounds", () => {
    const scrollElement = document.createElement("div");
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    scrollElement.scrollTop = 300;
    const updateSettings = vi.fn();
    const render = vi.fn();
    const api = {
      settings: { display: { scale: 1 } },
      updateSettings,
      render,
      tickPosition: 1920,
      isLooping: true,
    };
    let restore: (() => void) | undefined;
    const detach = attachScoreZoomCommit(document, api, scrollElement, (callback) => {
      restore = callback;
    });

    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.4 } }));

    expect(api.settings.display.scale).toBe(1.4);
    expect(updateSettings).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]!);
    expect(api.tickPosition).toBe(1920);
    expect(api.isLooping).toBe(true);
    expect(scrollElement.scrollTop).toBe(300);
    Object.defineProperty(scrollElement, "scrollHeight", { configurable: true, value: 1400 });
    restore?.();
    expect(scrollElement.scrollTop).toBe(500);

    detach();
    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.5 } }));
    expect(updateSettings).toHaveBeenCalledOnce();
  });

  it("restores the centered staff system after alphaTab finishes the zoom layout", () => {
    const scrollElement = document.createElement("div");
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    scrollElement.scrollTop = 100;
    const renderHandlers = new Set<() => void>();
    const api = {
      settings: { display: { scale: 1 } },
      updateSettings: vi.fn(),
      postRenderFinished: {
        on(handler: () => void) {
          renderHandlers.add(handler);
          return () => renderHandlers.delete(handler);
        },
      },
      boundsLookup: {
        staffSystems: [
          {
            index: 2,
            bars: [{ index: 4 }],
            realBounds: { x: 0, y: 200, w: 800, h: 100 },
          },
        ],
      },
    };
    const detach = attachScoreZoomCommit(document, api, scrollElement);

    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.4 } }));
    expect(scrollElement.scrollTop).toBe(100);
    expect(renderHandlers.size).toBe(1);

    Object.defineProperty(scrollElement, "scrollHeight", { configurable: true, value: 1400 });
    api.boundsLookup.staffSystems[0]!.realBounds.y = 500;
    for (const handler of renderHandlers) handler();

    expect(scrollElement.scrollTop).toBe(400);
    expect(renderHandlers.size).toBe(0);
    detach();
  });

  it("waits for the latest zoom render before restoring the centered staff system", () => {
    const scrollElement = document.createElement("div");
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    scrollElement.scrollTop = 100;
    const renderHandlers = new Set<() => void>();
    const api = {
      settings: { display: { scale: 1 } },
      updateSettings: vi.fn(),
      render: vi.fn(),
      postRenderFinished: {
        on(handler: () => void) {
          renderHandlers.add(handler);
          return () => renderHandlers.delete(handler);
        },
      },
      boundsLookup: {
        staffSystems: [
          {
            index: 2,
            bars: [{ index: 4 }],
            realBounds: { x: 0, y: 200, w: 800, h: 100 },
          },
        ],
      },
    };
    const detach = attachScoreZoomCommit(document, api, scrollElement);

    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.1 } }));
    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.2 } }));
    expect(api.render).toHaveBeenCalledOnce();

    Object.defineProperty(scrollElement, "scrollHeight", { configurable: true, value: 1200 });
    api.boundsLookup.staffSystems[0]!.realBounds.y = 350;
    for (const handler of [...renderHandlers]) handler();

    expect(scrollElement.scrollTop).toBe(100);
    expect(api.settings.display.scale).toBe(1.2);
    expect(api.render).toHaveBeenCalledTimes(2);

    Object.defineProperty(scrollElement, "scrollHeight", { configurable: true, value: 1400 });
    api.boundsLookup.staffSystems[0]!.realBounds.y = 500;
    for (const handler of [...renderHandlers]) handler();

    expect(scrollElement.scrollTop).toBe(400);
    detach();
  });

  it("accepts another zoom after alphaTab finishes rendering synchronously", () => {
    const scrollElement = document.createElement("div");
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    const renderHandlers = new Set<() => void>();
    const api = {
      settings: { display: { scale: 1 } },
      updateSettings: vi.fn(),
      render: vi.fn(() => {
        for (const handler of [...renderHandlers]) handler();
      }),
      postRenderFinished: {
        on(handler: () => void) {
          renderHandlers.add(handler);
          return () => renderHandlers.delete(handler);
        },
      },
    };
    const detach = attachScoreZoomCommit(document, api, scrollElement);

    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.1 } }));
    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: 1.2 } }));

    expect(api.settings.display.scale).toBe(1.2);
    expect(api.updateSettings).toHaveBeenCalledTimes(2);
    expect(api.render).toHaveBeenCalledTimes(2);
    detach();
  });

  it("restores the centered staff system after a width relayout", () => {
    const scrollElement = document.createElement("div");
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    scrollElement.scrollTop = 100;
    const renderHandlers = new Set<() => void>();
    const api = {
      settings: { display: { scale: 1 } },
      postRenderFinished: {
        on(handler: () => void) {
          renderHandlers.add(handler);
          return () => renderHandlers.delete(handler);
        },
      },
      boundsLookup: {
        staffSystems: [
          {
            index: 2,
            bars: [{ index: 4 }],
            realBounds: { x: 0, y: 200, w: 800, h: 100 },
          },
        ],
      },
    };
    const detach = attachScoreZoomCommit(document, api, scrollElement);

    document.dispatchEvent(new CustomEvent("zupulse:score-layout-commit", { detail: { reason: "width" } }));
    Object.defineProperty(scrollElement, "scrollHeight", { configurable: true, value: 1400 });
    api.boundsLookup.staffSystems[0]!.realBounds.y = 500;
    for (const handler of [...renderHandlers]) handler();

    expect(scrollElement.scrollTop).toBe(400);
    detach();
  });

  it("clears the empty state before alphaTab establishes its cursor coordinate system", async () => {
    renderSessionFixture(document);
    const createApi = vi.fn((element: HTMLElement) => {
      expect(element.querySelector(".score-empty-state")).toBeNull();
      expect(element.childElementCount).toBe(0);
      return { load: () => false };
    });
    const openSession = createDefaultOpenSession(document, {} as never, {
      createApi,
      createAdapter: () => ({ destroy: vi.fn() }) as never,
      presentFile: async () => ({ status: "error", issueCode: "viewer-load-failed" }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () => ({}) as never,
    });

    await openSession({ fileName: "song.gp5", bytes: new Uint8Array([1]) }, undefined, sessionBindings(document));

    expect(createApi).toHaveBeenCalledOnce();
  });

  it("enables alphaTab playback cursors and element highlighting", async () => {
    renderSessionFixture(document);
    const scoreHost = document.getElementById("alpha-tab");
    if (scoreHost) scoreHost.dataset.scoreZoom = "1.25";
    const createApi = vi.fn((_element: HTMLElement, _settings: unknown) => ({ load: () => false }));
    const openSession = createDefaultOpenSession(document, {} as never, {
      createApi,
      createAdapter: () => ({ destroy: vi.fn() }) as never,
      presentFile: async () => ({ status: "error", issueCode: "viewer-load-failed" }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () => ({}) as never,
    });

    await openSession({ fileName: "song.gp5", bytes: new Uint8Array([1]) }, undefined, sessionBindings(document));

    const [alphaTabHost, settings] = createApi.mock.calls[0] as [
      HTMLElement,
      {
        core: { includeNoteBounds: boolean };
        player: { scrollElement: HTMLElement };
        display: {
          scale: number;
          resources: {
            secondaryGlyphColor: string;
            titleFont: string;
            subTitleFont: string;
            wordsFont: string;
            tablatureFont: string;
            graceFont: string;
            barNumberFont: string;
            copyrightFont: string;
            markerFont: string;
            directionsFont: string;
            timerFont: string;
            fretboardNumberFont: string;
            numberedNotationFont: string;
            numberedNotationGraceFont: string;
          };
        };
      },
    ];
    expect(settings.player).toEqual(
      expect.objectContaining({
        enablePlayer: true,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableElementHighlighting: true,
        enableUserInteraction: false,
      }),
    );
    expect(settings.core.includeNoteBounds).toBe(true);
    expect(settings.player.scrollElement).toBe(alphaTabHost.parentElement);
    expect(settings.display.scale).toBe(1.25);
    expect(settings.display.resources.secondaryGlyphColor).toBe("#000000");
    expect(settings.display.resources).toEqual(
      expect.objectContaining({
        titleFont: expect.stringMatching(/^28px /),
        subTitleFont: expect.stringMatching(/^18px /),
        wordsFont: expect.stringMatching(/^14px /),
        tablatureFont: expect.stringMatching(/^12px /),
        graceFont: expect.stringMatching(/^10px /),
        barNumberFont: expect.stringMatching(/^10px /),
        copyrightFont: expect.stringMatching(/^bold 11px /),
        markerFont: expect.stringMatching(/^bold 13px /),
        directionsFont: expect.stringMatching(/^13px /),
        timerFont: expect.stringMatching(/^11px /),
        fretboardNumberFont: expect.stringMatching(/^10px /),
        numberedNotationFont: expect.stringMatching(/^13px /),
        numberedNotationGraceFont: expect.stringMatching(/^14px /),
      }),
    );
  });

  it("pauses and flushes the active playback controller", async () => {
    renderSessionFixture(document);
    const dispatch = vi.fn(async () => undefined);
    const flush = vi.fn(async () => undefined);
    const dependencies: DefaultOpenSessionDependencies = {
      createApi: () => ({}),
      createAdapter: () => ({ destroy: vi.fn() }) as never,
      presentFile: async () => ({
        status: "ready",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
      }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () =>
        ({
          initialize: async () => undefined,
          getState: () => ({ sessionId: "session" }),
          subscribe: () => () => undefined,
          dispatch,
          flush,
          destroy: async () => undefined,
        }) as never,
    };
    const openSession = createDefaultOpenSession(document, {} as never, dependencies);
    const session = await openSession(
      { fileName: "song.gp5", bytes: new Uint8Array([1]) },
      undefined,
      sessionBindings(document),
    );

    await session.pauseAndFlush();

    expect(dispatch).toHaveBeenCalledWith({ type: "pause" });
    expect(flush).toHaveBeenCalledOnce();
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0] ?? 0);
  });

  it.each(["initialize"] as const)("destroys the controller when %s fails", async (failurePoint) => {
    renderSessionFixture(document);
    const getById = vi.spyOn(document, "getElementById");
    const adapterDestroy = vi.fn();
    const controllerDestroy = vi.fn(async () => undefined);
    const failure = new Error(`${failurePoint} failed`);
    const dependencies: DefaultOpenSessionDependencies = {
      createApi: () => ({}),
      createAdapter: () => ({ destroy: adapterDestroy }) as never,
      presentFile: async () => ({
        status: "ready",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
      }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () =>
        ({
          initialize:
            failurePoint === "initialize"
              ? async () => {
                  throw failure;
                }
              : async () => undefined,
          getState: () => ({ sessionId: "session" }),
          subscribe: () => () => undefined,
          dispatch: async () => undefined,
          flush: async () => undefined,
          destroy: controllerDestroy,
        }) as never,
    };
    const openSession = createDefaultOpenSession(document, {} as never, dependencies);

    await openSession({ fileName: "song.gp5", bytes: new Uint8Array([1]) }, undefined, sessionBindings(document));

    expect(controllerDestroy).toHaveBeenCalledOnce();
    expect(adapterDestroy).not.toHaveBeenCalled();
    expect(document.querySelector("#status")?.textContent).toBe("无法加载乐谱");
    expect(document.body.textContent).not.toContain(failure.message);
    expect(getById).not.toHaveBeenCalled();
  });

  it("preserves initialization and controller cleanup failures", async () => {
    renderSessionFixture(document);
    const initializeFailure = new Error("initialize failed");
    const cleanupFailure = new Error("controller destroy failed");
    const dependencies: DefaultOpenSessionDependencies = {
      createApi: () => ({}),
      createAdapter: () => ({ destroy: vi.fn() }) as never,
      presentFile: async () => ({
        status: "ready",
        identity: { contentHash: "a".repeat(64), format: "gp" },
        summary: { title: "Song", trackCount: 1, masterBarCount: 1 },
      }),
      waitForScore: async () => ({}) as never,
      extractModel: () => ({
        baseTempo: 120,
        tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
        timeline: { durationTicks: 0, durationMs: 0, measures: [] },
      }),
      createController: () =>
        ({
          initialize: async () => {
            throw initializeFailure;
          },
          destroy: async () => {
            throw cleanupFailure;
          },
        }) as never,
    };
    const openSession = createDefaultOpenSession(document, {} as never, dependencies);

    const error = (await rejectionOf(
      openSession(
        {
          fileName: "song.gp5",
          bytes: new Uint8Array([1]),
        },
        undefined,
        sessionBindings(document),
      ),
    )) as AggregateError;

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([initializeFailure, cleanupFailure]);
  });
});

describe("renderViewerState", () => {
  it("renders ready metadata without interpreting user-provided text as HTML", () => {
    renderSessionFixture(document);
    const status = document.querySelector("#status") as HTMLElement;
    const summary = document.querySelector("#summary") as HTMLElement;

    renderViewerState(status, summary, {
      status: "ready",
      summary: {
        title: "<img src=x onerror=alert(1)>",
        artist: "Artist",
        trackCount: 2,
        masterBarCount: 3,
        tempo: 120,
      },
    });

    expect(status.textContent).toBe("已加载 <img src=x onerror=alert(1)>");
    expect(summary.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(summary.querySelector("img")).toBeNull();
  });

  it("clears stale summary for an error state", () => {
    renderSessionFixture(document);
    const status = document.querySelector("#status") as HTMLElement;
    const summary = document.querySelector("#summary") as HTMLElement;
    summary.textContent = "old summary";

    renderViewerState(status, summary, { status: "error", issueCode: "gp-file-required" });

    expect(status.textContent).toBe("请选择 Guitar Pro 文件");
    expect(summary.textContent).toBe("未打开乐谱");
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}
