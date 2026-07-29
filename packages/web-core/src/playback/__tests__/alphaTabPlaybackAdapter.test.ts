import { describe, expect, it, vi } from "vitest";
import type { AlphaTabApiLike, AlphaTabBrowserScoreLike, AlphaTabBrowserTrackLike } from "../../gp/alphaTabBrowser";
import {
  extractAlphaTabPlaybackOccurrences,
  AlphaTabPlaybackAdapter,
  extractAlphaTabPlaybackModel,
  waitForAlphaTabScore,
} from "../alphaTabPlaybackAdapter";

describe("extractAlphaTabPlaybackModel", () => {
  it("maps source tracks and master bars to stable playback data", () => {
    const api = createApi();

    expect(extractAlphaTabPlaybackModel(api)).toEqual({
      baseTempo: 120,
      tracks: [
        {
          id: "track-0",
          sourceIndex: 0,
          name: "Lead",
          staves: [
            { id: "track-0:staff-0", sourceIndex: 0, isPercussion: false },
            { id: "track-0:staff-1", sourceIndex: 1, isPercussion: false },
          ],
        },
        { id: "track-1", sourceIndex: 1, staves: [] },
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

describe("extractAlphaTabPlaybackOccurrences", () => {
  it("uses alphaTab's expanded master-bar tick lookup for repeat occurrences", () => {
    const api = createApi();
    api.tickCache = {
      masterBars: [
        { start: 0, end: 1920, masterBar: { index: 0 } },
        { start: 1920, end: 3840, masterBar: { index: 1 } },
        { start: 3840, end: 5760, masterBar: { index: 0 } },
      ],
    };

    const occurrences = extractAlphaTabPlaybackOccurrences(api);

    expect(
      occurrences
        .filter((item) => item.written.measureIndex === 0 && item.written.beatIndex === 1)
        .map((item) => ({
          occurrenceIndex: item.occurrenceIndex,
          timelineTick: item.timelineTick,
          path: item.path,
        })),
    ).toEqual([
      { occurrenceIndex: 0, timelineTick: 480, path: [0] },
      { occurrenceIndex: 1, timelineTick: 4320, path: [2] },
    ]);
  });
});

describe("AlphaTabPlaybackAdapter", () => {
  it("maps rhythm, transport, seek, speed, loop, visibility, and mixer commands", () => {
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
    adapter.setMetronomeVolume(0.6);
    adapter.setCountInVolume(0.7);

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
    expect(api.metronomeVolume).toBe(0.6);
    expect(api.countInVolume).toBe(0.7);
  });

  it("reports count-in lifecycle and skips a new count-in when resuming", () => {
    const events = createEvents();
    const api = createApi({ events });
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3");
    const received: unknown[] = [];
    adapter.subscribe((event) => received.push(event));
    adapter.setCountInVolume(0.7);

    adapter.playPause();
    expect(received).toContainEqual({ type: "count-in-started" });
    events.playerStateChanged.emit({ state: 1, stopped: false });
    events.playerStateChanged.emit({ state: 1, stopped: false });
    expect(received).toContainEqual({ type: "count-in-ended" });

    api.countInVolume = 0.7;
    adapter.playPause({ skipCountIn: true });
    expect(api.countInVolume).toBe(0.7);
  });

  it("loads a staff MIDI projection at a safe pause and restores mixer state", async () => {
    const calls: Array<[string, unknown]> = [];
    const events = createEvents();
    const player = new FakeProjectionPlayer(calls);
    const api = createApi({ calls, events, player });
    api.settings = {} as never;
    api.tickPosition = 960;
    const buildProjection = vi.fn(() => ({
      score: {},
      midiFile: { kind: "projected-midi" },
      tickShift: 0,
      syncPoints: [],
      transpositionPitches: new Map(),
    })) as never;
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3", buildProjection);
    adapter.setCountInVolume(0.7);
    api.playPause = () => calls.push(["playPause", api.countInVolume]);
    adapter.setTrackMute("track-0", true);
    adapter.setTrackSolo("track-0", false);
    adapter.setTrackVolume("track-0", 0.5);
    events.playerStateChanged.emit({ state: 1, stopped: false });

    const pending = adapter.setPianoStaffAudio(
      {
        trackId: "track-0",
        rightStaffId: "track-0:staff-0",
        leftStaffId: "track-0:staff-1",
      },
      ["track-0:staff-1"],
    );
    expect(calls).toContainEqual(["playPause", 0.7]);
    expect(calls).toContainEqual(["loadMidiFile", { kind: "projected-midi" }]);
    player.midiLoaded.emit({});
    await expect(pending).resolves.toEqual({ pausedForAudioProjection: true });

    expect(api.tickPosition).toBe(960);
    expect(calls.filter(([name]) => name === "playPause")).toHaveLength(2);
    expect(calls.slice(-4)).toEqual([
      ["mute", { tracks: [0], value: true }],
      ["solo", { tracks: [0], value: false }],
      ["volume", { tracks: [0], value: 0.5 }],
      ["playPause", 0],
    ]);
    expect(api.countInVolume).toBe(0.7);
  });

  it("restores the full score MIDI when a staff projection fails to load", async () => {
    const calls: Array<[string, unknown]> = [];
    const player = new FakeProjectionPlayer(calls);
    const api = createApi({ calls, player });
    api.settings = {} as never;
    api.tickPosition = 960;
    const buildProjection = vi.fn((_score, _settings, audibleStaffIds: ReadonlySet<string>) => ({
      score: {},
      midiFile: { audibleStaffIds: [...audibleStaffIds] },
      tickShift: 0,
      syncPoints: [],
      transpositionPitches: new Map(),
    })) as never;
    const adapter = new AlphaTabPlaybackAdapter(api, "/soundfont.sf3", buildProjection);

    const pending = adapter.setPianoStaffAudio(
      {
        trackId: "track-0",
        rightStaffId: "track-0:staff-0",
        leftStaffId: "track-0:staff-1",
      },
      ["track-0:staff-1"],
    );
    player.midiLoadFailed.emit(new Error("projection failed"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.filter(([name]) => name === "loadMidiFile")).toEqual([
      ["loadMidiFile", { audibleStaffIds: ["track-0:staff-1"] }],
      ["loadMidiFile", { audibleStaffIds: ["track-0:staff-0", "track-0:staff-1"] }],
    ]);
    player.midiLoaded.emit({});
    await expect(pending).rejects.toThrow("projection failed");
    expect(api.tickPosition).toBe(960);
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

  off(handler: (value: T) => void): void {
    this.listeners.delete(handler);
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
    tempo: 120,
    tracks: [
      {
        index: 0,
        name: "Lead",
        staves: [
          { index: 0, isPercussion: false },
          { index: 1, isPercussion: false },
        ],
      },
      { index: 1, staves: [] },
    ],
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
    player?: FakeProjectionPlayer;
  } = {},
): AlphaTabApiLike {
  const calls = input.calls ?? [];
  const events = input.events ?? createEvents();
  const score = createScore();
  return {
    score,
    endTick: 3840,
    endTime: 8000,
    metronomeVolume: 0,
    countInVolume: 0,
    scoreLoaded: events.scoreLoaded,
    playerReady: events.playerReady,
    playerStateChanged: events.playerStateChanged,
    playerPositionChanged: events.position,
    soundFontLoaded: events.soundFontLoaded,
    soundFontLoad: events.soundFontLoad,
    error: events.error,
    player: input.player as never,
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

class FakeProjectionPlayer {
  readonly midiLoaded = new TestEvent<unknown>();
  readonly midiLoadFailed = new TestEvent<Error>();

  constructor(private readonly calls: Array<[string, unknown]>) {}

  loadMidiFile(midiFile: unknown): void {
    this.calls.push(["loadMidiFile", midiFile]);
  }

  loadBackingTrack(score: unknown): void {
    this.calls.push(["loadBackingTrack", score]);
  }

  updateSyncPoints(syncPoints: unknown): void {
    this.calls.push(["updateSyncPoints", syncPoints]);
  }

  applyTranspositionPitches(pitches: unknown): void {
    this.calls.push(["applyTranspositionPitches", pitches]);
  }
}
