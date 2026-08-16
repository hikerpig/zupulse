// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultOpenSession, type DefaultOpenSessionDependencies } from "../viewer-session";
import { createViewerSessionSlices } from "../viewer-session-slices";
import type { ViewerDomBindings } from "../../host";
import type { ViewerSessionPort } from "../viewer-session-types";

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

const initialPlaybackState = {
  sessionId: "session",
  transport: "stopped",
  position: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
  pianoPractice: { mode: "both-hands", requestedMode: "both-hands", availability: "unavailable" },
};

const model = {
  baseTempo: 120,
  tracks: [{ id: "track-0", sourceIndex: 0, name: "Lead" }],
  timeline: {
    durationTicks: 3840,
    durationMs: 4000,
    measures: [
      { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
      { id: "measure-1", index: 1, startTick: 1920, durationTicks: 1920, beatTicks: [1920, 2400, 2880, 3360] },
    ],
  },
};

function makeApi() {
  const detachBeatSelection = vi.fn();
  const api = {
    score: { tracks: [], masterBars: [] },
    settings: {},
    tickPosition: 240,
    beatMouseDown: {
      on: vi.fn(() => detachBeatSelection),
    },
  };
  return { api, detachBeatSelection };
}

function makeNavigation() {
  return {
    getSnapshot: vi.fn(() => ({
      mode: "continuous",
      followState: "following",
      viewportHeight: 0,
      pageIndex: 0,
      pageCount: 0,
    })),
    subscribe: vi.fn(() => () => undefined),
    setMode: vi.fn(),
    returnToPlayback: vi.fn(),
    movePage: vi.fn(),
    manualNavigation: vi.fn(),
    beginGeneration: vi.fn(),
    setSystems: vi.fn(),
    cursorSystemChanged: vi.fn(),
    isScrubPreviewing: vi.fn(() => false),
    formalSeek: vi.fn(),
    transportChanged: vi.fn(),
    setLoopMeasureRange: vi.fn(),
    beginScrubPreview: vi.fn(),
  };
}

function makeController() {
  const listeners = new Set<(state: unknown) => void>();
  const dispatch = vi.fn(async () => undefined);
  const previewSeek = vi.fn();
  const destroy = vi.fn(async () => undefined);
  const emit = (state: unknown) => {
    for (const listener of listeners) listener(state);
  };
  const controller = {
    initialize: async () => undefined,
    getState: () => initialPlaybackState,
    subscribe: (listener: (state: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    previewSeek,
    flush: async () => undefined,
    destroy,
    emit,
  };
  return { controller, dispatch, previewSeek, controllerDestroy: destroy, emit };
}

function loopRegion(measureIndex: number, endMeasureIndex = measureIndex + 2) {
  return {
    id: "L1",
    labelSource: "generated" as const,
    label: "Loop",
    start: { measureId: `measure-${measureIndex}`, measureIndex, beatIndex: 0, tick: measureIndex * 1920 },
    end: {
      measureId: `measure-${endMeasureIndex}`,
      measureIndex: endMeasureIndex,
      beatIndex: 0,
      tick: endMeasureIndex * 1920,
    },
  };
}

function playingState(measureIndex: number): Record<string, unknown> {
  return {
    transport: "playing",
    looping: true,
    activeLoopId: "L1",
    loops: [loopRegion(measureIndex)],
    loopDraft: { snapMode: "bar", start: undefined, end: undefined },
  };
}

async function openReadySession(): Promise<{
  session: ViewerSessionPort;
  emit: (state: unknown) => void;
  navigation: ReturnType<typeof makeNavigation>;
  dispatch: ReturnType<typeof makeController>["dispatch"];
  previewSeek: ReturnType<typeof makeController>["previewSeek"];
  controllerDestroy: ReturnType<typeof makeController>["controllerDestroy"];
  adapterDestroy: ReturnType<typeof vi.fn>;
  detachBeatSelection: ReturnType<typeof vi.fn>;
}> {
  renderSessionFixture(document);
  const { api, detachBeatSelection } = makeApi();
  const { controller, dispatch, previewSeek, controllerDestroy, emit } = makeController();
  const navigation = makeNavigation();
  const adapterDestroy = vi.fn();
  const dependencies: DefaultOpenSessionDependencies = {
    createApi: () => api,
    createAdapter: () => ({ destroy: adapterDestroy }) as never,
    presentFile: async () => ({
      status: "ready",
      message: "已加载 Song",
      identity: { contentHash: "a".repeat(64), format: "gp" },
      summary: { title: "Song", trackCount: 1, masterBarCount: 2 },
    }),
    waitForScore: async () => ({}) as never,
    extractModel: () => model,
    createController: () => controller as never,
    buildPianoKeyTimeline: vi.fn(),
    createNavigation: () => navigation as never,
  };
  const openSession = createDefaultOpenSession(document, {} as never, dependencies);
  const session = await openSession(
    { fileName: "song.gp5", bytes: new Uint8Array([1]) },
    undefined,
    sessionBindings(document),
  );
  return { session, emit, navigation, dispatch, previewSeek, controllerDestroy, adapterDestroy, detachBeatSelection };
}

describe("ViewerSession navigation policy", () => {
  it("fires setLoopMeasureRange only when the effective loop boundary changes", async () => {
    const { emit, navigation } = await openReadySession();

    emit(playingState(1));
    expect(navigation.setLoopMeasureRange).toHaveBeenCalledTimes(1);
    expect(navigation.setLoopMeasureRange).toHaveBeenLastCalledWith({ startMeasureIndex: 1, endMeasureIndex: 3 });

    emit(playingState(1));
    expect(navigation.setLoopMeasureRange).toHaveBeenCalledTimes(1);

    emit(playingState(5));
    expect(navigation.setLoopMeasureRange).toHaveBeenCalledTimes(2);
    expect(navigation.setLoopMeasureRange).toHaveBeenLastCalledWith({ startMeasureIndex: 5, endMeasureIndex: 7 });
  });

  it("restores following only when transport enters stopped", async () => {
    const { emit, navigation } = await openReadySession();

    emit({ transport: "playing", looping: false, activeLoopId: undefined, loops: [], loopDraft: { snapMode: "bar" } });
    emit({ transport: "paused", looping: false, activeLoopId: undefined, loops: [], loopDraft: { snapMode: "bar" } });
    expect(navigation.transportChanged).not.toHaveBeenCalled();

    emit({ transport: "stopped", looping: false, activeLoopId: undefined, loops: [], loopDraft: { snapMode: "bar" } });
    expect(navigation.transportChanged).toHaveBeenCalledWith("stopped");
    expect(navigation.transportChanged).toHaveBeenCalledTimes(1);

    emit({ transport: "stopped", looping: false, activeLoopId: undefined, loops: [], loopDraft: { snapMode: "bar" } });
    expect(navigation.transportChanged).toHaveBeenCalledTimes(1);
  });

  it("routes seek, stop, and previewSeek through the controller", async () => {
    const { session, navigation, dispatch, previewSeek } = await openReadySession();
    const slices = createViewerSessionSlices(session);
    const position = { measureId: "measure-1", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 2000 };

    await slices.playback?.dispatch({ type: "seek", position });
    expect(navigation.formalSeek).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "seek", position });

    await slices.playback?.dispatch({ type: "stop" });
    expect(navigation.transportChanged).toHaveBeenCalledWith("stopped");
    expect(dispatch).toHaveBeenCalledWith({ type: "stop" });

    slices.playback?.previewSeek(position);
    expect(navigation.beginScrubPreview).toHaveBeenCalledOnce();
    expect(previewSeek).toHaveBeenCalledWith(position);
  });
  it("replays the current snapshot to late playback subscribers", async () => {
    const { session, emit } = await openReadySession();
    const playback = createViewerSessionSlices(session).playback!;
    const listener = vi.fn();

    emit(playingState(1));
    playback.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ transport: "playing", looping: true }));
  });

  it("exposes a narrow external-store session and slice adapters", async () => {
    const { session } = await openReadySession();
    expect(session).toEqual(
      expect.objectContaining({
        getSnapshot: expect.any(Function),
        subscribe: expect.any(Function),
        dispatch: expect.any(Function),
        destroy: expect.any(Function),
      }),
    );
    expect(session).not.toHaveProperty("playback");
  });
});
