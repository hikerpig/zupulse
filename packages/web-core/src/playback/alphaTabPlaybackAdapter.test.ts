import { describe, expect, it } from "vitest";
import type { AlphaTabApiLike, AlphaTabBrowserScoreLike, AlphaTabBrowserTrackLike } from "../gp/alphaTabBrowser";
import { AlphaTabPlaybackAdapter, extractAlphaTabPlaybackModel, waitForAlphaTabScore } from "./alphaTabPlaybackAdapter";

describe("extractAlphaTabPlaybackModel", () => {
  it("maps source tracks and master bars to stable playback data", () => {
    const api = createApi();

    expect(extractAlphaTabPlaybackModel(api)).toEqual({
      tracks: [
        { id: "track-0", sourceIndex: 0, name: "Lead" },
        { id: "track-1", sourceIndex: 1, name: "轨道 2" },
      ],
      timeline: {
        durationTicks: 3840,
        durationMs: 8000,
        measures: [
          {
            id: "measure-0",
            index: 0,
            startTick: 0,
            durationTicks: 1920,
            beatTicks: [0, 480, 960, 1440],
          },
          {
            id: "measure-1",
            index: 1,
            startTick: 1920,
            durationTicks: 1920,
            beatTicks: [1920, 2400, 2880, 3360],
          },
        ],
      },
    });
  });

  it("falls back to the score timeline while alphaTab endTick is still zero", () => {
    const api = createApi();
    api.endTick = 0;

    expect(extractAlphaTabPlaybackModel(api).timeline.durationTicks).toBe(3840);
  });
});

describe("AlphaTabPlaybackAdapter", () => {
  it("maps transport, seek, speed, loop, visibility, and mixer commands", () => {
    const calls: Array<[string, unknown]> = [];
    const api = createApi({ calls });
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3");

    adapter.playPause();
    adapter.stop();
    adapter.seekTick(960);
    adapter.setSpeed(0.75);
    adapter.setLoop({ startTick: 480, endTick: 1440 }, true);
    adapter.setVisibleTracks(["track-1", "track-0"]);
    adapter.setTrackMute("track-0", true);
    adapter.setTrackSolo("track-1", true);
    adapter.setTrackVolume("track-0", 2);

    expect(calls).toEqual([
      ["playPause", undefined],
      ["stop", undefined],
      ["renderTracks", [1, 0]],
      ["mute", { tracks: [0], value: true }],
      ["solo", { tracks: [1], value: true }],
      ["volume", { tracks: [0], value: 1 }],
    ]);
    expect(api.tickPosition).toBe(960);
    expect(api.playbackSpeed).toBe(0.75);
    expect(api.playbackRange).toEqual({ startTick: 480, endTick: 1440 });
    expect(api.isLooping).toBe(true);
  });

  it("maps alphaTab events and keeps an observable snapshot", () => {
    const events = createEvents();
    const api = createApi({ events });
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3");
    const received: unknown[] = [];
    adapter.subscribe((event) => received.push(event));

    events.playerStateChanged.emit({ state: 1, stopped: false });
    events.position.emit({ currentTime: 1200, endTime: 8000, tickPosition: 576 });
    events.error.emit(new Error("font failed"));
    events.soundFontLoaded.emit();
    events.playerStateChanged.emit({ state: 0, stopped: false });
    events.playerStateChanged.emit({ state: 0, stopped: true });
    events.error.emit(new Error("late error"));

    expect(received).toEqual([
      { type: "transport", state: "playing" },
      { type: "position", positionMs: 1200, endMs: 8000, tick: 576 },
      { type: "soundfont-error", error: new Error("font failed") },
      { type: "soundfont-ready" },
      { type: "transport", state: "paused" },
      { type: "transport", state: "stopped" },
      { type: "error", error: new Error("late error") },
    ]);
    expect(adapter.getSnapshot()).toEqual({ soundFont: "ready", transport: "stopped" });
  });

  it("retries SoundFont and rejects unknown tracks", () => {
    const calls: Array<[string, unknown]> = [];
    const api = createApi({ calls });
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3");

    adapter.retrySoundFont();

    expect(calls).toContainEqual(["loadSoundFont", { url: "/soundfont.sf3", append: false }]);
    expect(() => adapter.setTrackMute("track-99", true)).toThrow("Unknown alphaTab track: track-99");
  });

  it("detaches alphaTab events before destroying the API", () => {
    const events = createEvents();
    const calls: Array<[string, unknown]> = [];
    const api = createApi({ calls, events });
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3");

    adapter.destroy();

    expect(events.all.every((event) => event.listenerCount === 0)).toBe(true);
    expect(calls.at(-1)).toEqual(["destroy", undefined]);
  });
});

describe("waitForAlphaTabScore", () => {
  it("resolves immediately for an existing score", async () => {
    const api = createApi();

    await expect(waitForAlphaTabScore(api)).resolves.toBe(api.score);
  });

  it("waits for scoreLoaded when the score is not ready", async () => {
    const scoreLoaded = new TestEvent<AlphaTabBrowserScoreLike>();
    const api: AlphaTabApiLike = { score: null, scoreLoaded };
    const score = createScore();
    const pending = waitForAlphaTabScore(api);

    scoreLoaded.emit(score);

    await expect(pending).resolves.toBe(score);
    expect(scoreLoaded.listenerCount).toBe(0);
  });
});

class TestEvent<T> {
  private readonly listeners = new Set<(value: T) => void>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  on(handler: (value: T) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

class TestVoidEvent {
  private readonly listeners = new Set<() => void>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  on(handler: () => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createEvents() {
  const scoreLoaded = new TestEvent<AlphaTabBrowserScoreLike>();
  const playerReady = new TestVoidEvent();
  const playerStateChanged = new TestEvent<unknown>();
  const position = new TestEvent<unknown>();
  const soundFontLoaded = new TestVoidEvent();
  const soundFontLoad = new TestEvent<{ loaded?: number; total?: number }>();
  const error = new TestEvent<unknown>();
  return {
    scoreLoaded,
    playerReady,
    playerStateChanged,
    position,
    soundFontLoaded,
    soundFontLoad,
    error,
    all: [scoreLoaded, playerReady, playerStateChanged, position, soundFontLoaded, soundFontLoad, error],
  };
}

function createScore(): AlphaTabBrowserScoreLike {
  return {
    tracks: [{ index: 0, name: "Lead" }, { index: 1 }],
    masterBars: [
      { index: 0, start: 0, timeSignatureNumerator: 4, calculateDuration: () => 1920 },
      { index: 1, start: 1920, timeSignatureNumerator: 4, calculateDuration: () => 1920 },
    ],
  };
}

function createApi(
  input: {
    calls?: Array<[string, unknown]>;
    events?: ReturnType<typeof createEvents>;
  } = {},
): AlphaTabApiLike {
  const calls = input.calls ?? [];
  const events = input.events ?? createEvents();
  const score = createScore();
  return {
    score,
    endTick: 3840,
    endTime: 8000,
    scoreLoaded: events.scoreLoaded,
    playerReady: events.playerReady,
    playerStateChanged: events.playerStateChanged,
    playerPositionChanged: events.position,
    soundFontLoaded: events.soundFontLoaded,
    soundFontLoad: events.soundFontLoad,
    error: events.error,
    playPause: () => calls.push(["playPause", undefined]),
    stop: () => calls.push(["stop", undefined]),
    renderTracks: (tracks) => calls.push(["renderTracks", tracks.map((track) => track.index)]),
    changeTrackMute: (tracks, value) => calls.push(["mute", { tracks: tracks.map((track) => track.index), value }]),
    changeTrackSolo: (tracks, value) => calls.push(["solo", { tracks: tracks.map((track) => track.index), value }]),
    changeTrackVolume: (tracks, value) => calls.push(["volume", { tracks: tracks.map((track) => track.index), value }]),
    loadSoundFontFromUrl: (url, append) => calls.push(["loadSoundFont", { url, append }]),
    destroy: () => calls.push(["destroy", undefined]),
  };
}
