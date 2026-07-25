import { describe, expect, it } from "vitest";
import type { LocalPlaybackResume } from "../../bridge/types";
import type { ScoreIdentity } from "../../score/types";
import { createDefaultSidecar, type SidecarPayload } from "../../storage/sidecar";
import type { PlaybackPersistence } from "../playbackPersistence";
import { PlaybackController } from "../playbackController";
import type {
  PlaybackEngine,
  PlaybackEngineEvent,
  PlaybackEngineSnapshot,
  PlaybackTimelineMap,
  PlaybackTrack,
} from "../types";

const identity: ScoreIdentity = { contentHash: "a".repeat(64), format: "gp" };
const tracks: PlaybackTrack[] = [
  { id: "track-0", sourceIndex: 0, name: "Lead" },
  { id: "track-1", sourceIndex: 1, name: "Bass" },
];
const timeline: PlaybackTimelineMap = {
  durationTicks: 3840,
  durationMs: 8000,
  measures: [
    { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
    { id: "measure-1", index: 1, startTick: 1920, durationTicks: 1920, beatTicks: [1920, 2400, 2880, 3360] },
  ],
};

describe("PlaybackController", () => {
  it("debounces sidecar writes for 500 ms", async () => {
    const schedule = new ManualSchedule();
    const persistence = new FakePersistence();
    const controller = createController(
      new FakeEngine({ soundFont: "ready", transport: "stopped" }),
      persistence,
      schedule,
    );
    await controller.initialize();

    await controller.dispatch({ type: "set-score-speed", speed: 0.75 });
    schedule.advanceBy(499);
    await flushPromises();
    expect(persistence.sidecarWrites).toHaveLength(0);
    schedule.advanceBy(1);
    await flushPromises();
    expect(persistence.sidecarWrites).toHaveLength(1);
  });

  it("keeps one-BPM score speed precision", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const controller = createController(engine, new FakePersistence());
    await controller.initialize();

    await controller.dispatch({ type: "set-score-speed", speed: 91 / 120 });

    expect(controller.getState().scoreSpeed).toBe(0.7583);
    expect(engine.calls.at(-1)).toEqual(["speed", 0.7583]);
  });

  it("previews a seek in the engine without notifying or persisting playback state", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence();
    const controller = createController(engine, persistence);
    await controller.initialize();
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });
    const before = controller.getState();

    controller.previewSeek(position(2400, 5000));
    engine.emit({ type: "position", positionMs: 5000, endMs: 8000, tick: 2400 });
    await controller.flush();

    expect(engine.calls.at(-1)).toEqual(["seek", 2400]);
    expect(controller.getState()).toEqual(before);
    expect(notifications).toBe(1);
    expect(persistence.resumeWrites).toHaveLength(0);
  });

  it("publishes ordinary playing positions at most every 100 ms and flushes the latest position on pause", async () => {
    const schedule = new ManualSchedule();
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const controller = createController(engine, new FakePersistence(), schedule);
    await controller.initialize();
    engine.emit({ type: "transport", state: "playing" });
    const positions: number[] = [];
    controller.subscribe((snapshot) => positions.push(snapshot.position.tick));
    positions.length = 0;

    for (let index = 1; index <= 20; index += 1) {
      engine.emit({ type: "position", positionMs: index * 10, endMs: 8000, tick: index * 10 });
    }
    expect(positions).toEqual([]);
    schedule.advanceBy(100);
    expect(positions).toEqual([200]);

    engine.emit({ type: "position", positionMs: 300, endMs: 8000, tick: 300 });
    engine.emit({ type: "transport", state: "paused" });
    expect(positions.at(-1)).toBe(300);
    schedule.advanceBy(100);
    expect(positions).toEqual([200, 300]);
  });

  it("pauses and immediately saves resume state", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence();
    const controller = createController(engine, persistence);
    await controller.initialize();
    engine.emit({ type: "transport", state: "playing" });

    await controller.dispatch({ type: "pause" });

    expect(engine.calls.filter(([name]) => name === "playPause")).toHaveLength(1);
    expect(persistence.resumeWrites).toHaveLength(1);
  });

  it("restores persisted settings and resume without autoplay", async () => {
    const sidecar = createDefaultSidecar(identity, "2026-07-10T00:00:00Z");
    sidecar.practice.playback.scoreSpeed.value = 0.75;
    sidecar.practice.playback.visibility = {
      primaryTrackId: "track-1",
      additionalTrackIds: ["track-0", "missing"],
      updatedAt: "2026-07-10T01:00:00Z",
    };
    sidecar.practice.playback.tracks["track-0"] = {
      muted: true,
      volume: 0.5,
      muteUpdatedAt: "2026-07-10T01:00:00Z",
      volumeUpdatedAt: "2026-07-10T01:00:00Z",
    };
    const resume: LocalPlaybackResume = {
      position: position(2400, 5000),
      updatedAt: "2026-07-10T02:00:00Z",
    };
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence(sidecar, resume);
    const controller = createController(engine, persistence);

    await controller.initialize();

    expect(controller.getState()).toMatchObject({
      transport: "ready",
      soundFont: "ready",
      baseTempo: 120,
      scoreSpeed: 0.75,
      position: { tick: 2400 },
      trackState: {
        primaryVisibleTrackId: "track-1",
        additionalVisibleTrackIds: ["track-0"],
      },
    });
    expect(engine.calls).toContainEqual(["visible", ["track-1", "track-0"]]);
    expect(engine.calls).toContainEqual(["mute", { trackId: "track-0", value: true }]);
    expect(engine.calls).toContainEqual(["volume", { trackId: "track-0", value: 0.5 }]);
    expect(engine.calls).toContainEqual(["speed", 0.75]);
    expect(engine.calls).toContainEqual(["seek", 2400]);
    expect(engine.calls.some(([name]) => name === "playPause")).toBe(false);
  });

  it("uses engine events as transport truth and retries SoundFont", async () => {
    const engine = new FakeEngine({ soundFont: "loading", transport: "stopped" });
    const controller = createController(engine, new FakePersistence());
    await controller.initialize();

    expect(controller.getState().transport).toBe("loading");
    engine.emit({ type: "soundfont-ready" });
    expect(controller.getState().transport).toBe("ready");

    await controller.dispatch({ type: "toggle-playback" });
    expect(controller.getState().transport).toBe("ready");
    expect(engine.calls.at(-1)).toEqual(["playPause", undefined]);

    engine.emit({ type: "transport", state: "playing" });
    expect(controller.getState().transport).toBe("playing");
    engine.emit({ type: "soundfont-error", error: new Error("missing") });
    await controller.dispatch({ type: "retry-soundfont" });
    expect(engine.calls.at(-1)).toEqual(["retrySoundFont", undefined]);
    expect(controller.getState().soundFont).toBe("loading");
  });

  it("creates snapped locale-neutral loops and applies speed overrides", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const controller = createController(engine, new FakePersistence());
    await controller.initialize();

    await controller.dispatch({ type: "set-score-speed", speed: 0.81 });
    await controller.dispatch({ type: "set-loop-snap", mode: "beat" });
    await controller.dispatch({ type: "set-loop-boundary", boundary: "start", position: position(731, 1500) });
    await controller.dispatch({ type: "set-loop-boundary", boundary: "end", position: position(2890, 6000) });
    await controller.dispatch({ type: "save-loop" });

    const loop = controller.getState().loops[0];
    expect(loop).toMatchObject({
      id: "loop-1",
      labelSource: "generated",
      start: { tick: 960 },
      end: { tick: 2880 },
    });
    expect(loop).not.toHaveProperty("label");
    expect(engine.calls).toContainEqual(["loop", { range: { startTick: 960, endTick: 2880 }, enabled: true }]);
    expect(engine.calls).toContainEqual(["seek", 960]);

    await controller.dispatch({ type: "set-loop-speed", loopId: "loop-1", speed: 0.54 });
    expect(engine.calls.at(-1)).toEqual(["speed", 0.55]);
    await controller.dispatch({ type: "set-loop-enabled", enabled: false });
    expect(engine.calls.slice(-2)).toEqual([
      ["loop", { range: null, enabled: false }],
      ["speed", 0.81],
    ]);
  });

  it("rehydrates legacy loop positions without dirtying the sidecar", async () => {
    const sidecar = createDefaultSidecar(identity, "2026-07-10T00:00:00Z");
    sidecar.practice.playback.loops = [
      {
        id: "legacy-loop",
        label: "循环 legacy-loop",
        labelSource: "generated",
        start: {
          measureId: "legacy",
          measureIndex: -1,
          beatIndex: -1,
          tick: 120,
          cachedTimeMs: 250,
        },
        end: {
          measureId: "legacy",
          measureIndex: -1,
          beatIndex: -1,
          tick: 2400,
          cachedTimeMs: 5000,
        },
        snapMode: "off",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
    ];
    const persistence = new FakePersistence(sidecar);
    const controller = createController(new FakeEngine({ soundFont: "ready", transport: "stopped" }), persistence);

    await controller.initialize();

    expect(controller.getState().loops[0]).toMatchObject({
      start: { measureId: "measure-0", measureIndex: 0, tick: 120 },
      end: { measureId: "measure-1", measureIndex: 1, tick: 2400 },
    });
    await controller.flush();
    expect(persistence.sidecarWrites).toHaveLength(0);
  });

  it("keeps display and mixer independent and never persists solo", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence();
    const controller = createController(engine, persistence);
    await controller.initialize();

    await controller.dispatch({ type: "set-primary-track", trackId: "track-1" });
    await controller.dispatch({ type: "set-additional-tracks", trackIds: ["track-0"] });
    await controller.dispatch({ type: "set-track-mute", trackId: "track-0", muted: true });
    await controller.dispatch({ type: "set-track-solo", trackId: "track-1", solo: true });
    await controller.dispatch({ type: "set-track-volume", trackId: "track-0", volume: 0.45 });
    await controller.flush();

    expect(engine.calls).toContainEqual(["visible", ["track-1", "track-0"]]);
    expect(engine.calls).toContainEqual(["solo", { trackId: "track-1", value: true }]);
    expect(persistence.sidecarWrites).toHaveLength(1);
    expect(JSON.stringify(persistence.sidecarWrites[0])).not.toContain("solo");
    expect(persistence.sidecarWrites[0]?.practice.playback.tracks["track-0"]).toMatchObject({
      muted: true,
      volume: 0.45,
    });
  });

  it("saves resume separately and ignores late events after destroy", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence();
    const controller = createController(engine, persistence);
    await controller.initialize();
    const lateListener = engine.listener;

    engine.emit({ type: "position", positionMs: 5200, endMs: 8000, tick: 2500 });
    await controller.flush();
    expect(persistence.resumeWrites.at(-1)?.position).toEqual(position(2500, 5200));

    await controller.destroy();
    const before = controller.getState();
    lateListener?.({ type: "position", positionMs: 7000, endMs: 8000, tick: 3360 });

    expect(controller.getState()).toEqual(before);
    expect(engine.destroyed).toBe(true);
  });

  it("reports sidecar failures without disabling playback and recovers later", async () => {
    const engine = new FakeEngine({ soundFont: "ready", transport: "stopped" });
    const persistence = new FakePersistence();
    const controller = createController(engine, persistence);
    await controller.initialize();

    persistence.failNextSidecar = true;
    await controller.dispatch({ type: "set-track-mute", trackId: "track-0", muted: true });
    await controller.flush();
    expect(controller.getState().persistence).toBe("error");

    await controller.dispatch({ type: "toggle-playback" });
    expect(engine.calls.at(-1)).toEqual(["playPause", undefined]);
    await controller.dispatch({ type: "set-track-volume", trackId: "track-0", volume: 0.6 });
    await controller.flush();
    expect(controller.getState().persistence).toBe("clean");
  });
});

function createController(
  engine: FakeEngine,
  persistence: FakePersistence,
  schedule: { set(delayMs: number, callback: () => void): unknown; clear(handle: unknown): void } = {
    set: () => 1,
    clear: () => undefined,
  },
) {
  return new PlaybackController({
    sessionId: "session-1",
    identity,
    engine,
    persistence,
    baseSidecar: createDefaultSidecar(identity, "2026-07-10T00:00:00Z"),
    tracks,
    timeline,
    baseTempo: 120,
    clock: { now: () => "2026-07-10T04:00:00Z" },
    ids: { next: () => "loop-1" },
    schedule,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class ManualSchedule {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { dueAt: number; callback: () => void }>();

  set(delayMs: number, callback: () => void): number {
    const id = this.nextId++;
    this.tasks.set(id, { dueAt: this.now + delayMs, callback });
    return id;
  }

  clear(handle: unknown): void {
    if (typeof handle === "number") this.tasks.delete(handle);
  }

  advanceBy(delayMs: number): void {
    this.now += delayMs;
    for (const [id, task] of [...this.tasks]) {
      if (task.dueAt <= this.now) {
        this.tasks.delete(id);
        task.callback();
      }
    }
  }
}

function position(tick: number, cachedTimeMs: number) {
  const secondMeasure = tick >= 1920;
  const beatTicks = secondMeasure ? [1920, 2400, 2880, 3360] : [0, 480, 960, 1440];
  let beatIndex = 0;
  for (let index = 0; index < beatTicks.length; index += 1) {
    if ((beatTicks[index] ?? 0) <= tick) beatIndex = index;
  }
  return {
    measureId: secondMeasure ? "measure-1" : "measure-0",
    measureIndex: secondMeasure ? 1 : 0,
    beatIndex,
    tick,
    cachedTimeMs,
  };
}

class FakeEngine implements PlaybackEngine {
  readonly calls: Array<[string, unknown]> = [];
  listener: ((event: PlaybackEngineEvent) => void) | undefined;
  destroyed = false;

  constructor(private snapshot: PlaybackEngineSnapshot) {}

  subscribe(listener: (event: PlaybackEngineEvent) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  getSnapshot(): PlaybackEngineSnapshot {
    return { ...this.snapshot };
  }

  emit(event: PlaybackEngineEvent): void {
    if (event.type === "soundfont-ready") this.snapshot.soundFont = "ready";
    if (event.type === "soundfont-error") this.snapshot.soundFont = "error";
    if (event.type === "transport") this.snapshot.transport = event.state;
    this.listener?.(event);
  }

  playPause(): void {
    this.calls.push(["playPause", undefined]);
  }
  stop(): void {
    this.calls.push(["stop", undefined]);
  }
  retrySoundFont(): void {
    this.calls.push(["retrySoundFont", undefined]);
  }
  seekTick(tick: number): void {
    this.calls.push(["seek", tick]);
  }
  setSpeed(speed: number): void {
    this.calls.push(["speed", speed]);
  }
  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void {
    this.calls.push(["loop", { range, enabled }]);
  }
  setVisibleTracks(trackIds: string[]): void {
    this.calls.push(["visible", trackIds]);
  }
  setTrackMute(trackId: string, muted: boolean): void {
    this.calls.push(["mute", { trackId, value: muted }]);
  }
  setTrackSolo(trackId: string, solo: boolean): void {
    this.calls.push(["solo", { trackId, value: solo }]);
  }
  setTrackVolume(trackId: string, volume: number): void {
    this.calls.push(["volume", { trackId, value: volume }]);
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakePersistence implements PlaybackPersistence {
  readonly sidecarWrites: SidecarPayload[] = [];
  readonly resumeWrites: LocalPlaybackResume[] = [];
  failNextSidecar = false;

  constructor(
    private readonly savedSidecar?: SidecarPayload,
    private readonly savedResume?: LocalPlaybackResume,
  ) {}

  async readSidecar(): Promise<SidecarPayload | undefined> {
    return this.savedSidecar;
  }

  async writeSidecar(_identity: ScoreIdentity, payload: SidecarPayload): Promise<void> {
    if (this.failNextSidecar) {
      this.failNextSidecar = false;
      throw new Error("save failed");
    }
    this.sidecarWrites.push(structuredClone(payload));
  }

  async readResume(): Promise<LocalPlaybackResume | undefined> {
    return this.savedResume;
  }

  async writeResume(_identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void> {
    this.resumeWrites.push(structuredClone(resume));
  }
}
