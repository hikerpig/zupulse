import type {
  AlphaTabApiLike,
  AlphaTabBrowserScoreLike,
  AlphaTabBrowserTrackLike,
} from "../gp/alphaTabBrowser";
import type {
  PlaybackEngine,
  PlaybackEngineEvent,
  PlaybackEngineSnapshot,
  PlaybackTimelineMap,
  PlaybackTrack,
} from "./types";

export function extractAlphaTabPlaybackModel(api: AlphaTabApiLike): {
  tracks: PlaybackTrack[];
  timeline: PlaybackTimelineMap;
} {
  const score = api.score;
  if (!score) throw new Error("alphaTab score is not loaded");

  const measures = score.masterBars.map(masterBar => {
    const durationTicks = masterBar.calculateDuration(true);
    const beatCount = Math.max(1, masterBar.timeSignatureNumerator ?? 4);
    const beatDuration = durationTicks / beatCount;
    return {
      id: `measure-${masterBar.index}`,
      index: masterBar.index,
      startTick: masterBar.start,
      durationTicks,
      beatTicks: Array.from(
        { length: beatCount },
        (_, beatIndex) => masterBar.start + beatDuration * beatIndex,
      ),
    };
  });
  const finalMeasure = measures.at(-1);
  const scoreDurationTicks = finalMeasure
    ? finalMeasure.startTick + finalMeasure.durationTicks
    : 0;

  return {
    tracks: score.tracks.map(track => ({
      id: trackId(track.index),
      sourceIndex: track.index,
      name: track.name?.trim() || `轨道 ${track.index + 1}`,
    })),
    timeline: {
      durationTicks: api.endTick && api.endTick > 0 ? api.endTick : scoreDurationTicks,
      durationMs: api.endTime ?? 0,
      measures,
    },
  };
}

export function waitForAlphaTabScore(api: AlphaTabApiLike): Promise<AlphaTabBrowserScoreLike> {
  if (api.score) return Promise.resolve(api.score);
  if (!api.scoreLoaded) return Promise.reject(new Error("alphaTab scoreLoaded event is unavailable"));

  return new Promise(resolve => {
    const detach = api.scoreLoaded?.on(score => {
      detach?.();
      resolve(score);
    });
  });
}

export class AlphaTabPlaybackAdapter implements PlaybackEngine {
  private readonly listeners = new Set<(event: PlaybackEngineEvent) => void>();
  private readonly detachEvents: Array<() => void> = [];
  private readonly tracks = new Map<string, AlphaTabBrowserTrackLike>();
  private snapshot: PlaybackEngineSnapshot = {
    soundFont: "loading",
    transport: "stopped",
  };
  private destroyed = false;

  constructor(
    private readonly api: AlphaTabApiLike,
    private readonly soundFontUrl: string,
  ) {
    if (api.score) this.refreshTracks(api.score);
    this.attachEvents();
  }

  subscribe(listener: (event: PlaybackEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): PlaybackEngineSnapshot {
    return { ...this.snapshot };
  }

  playPause(): void {
    this.api.playPause?.();
  }

  stop(): void {
    this.api.stop?.();
  }

  retrySoundFont(): void {
    this.snapshot = { ...this.snapshot, soundFont: "loading" };
    this.emit({ type: "soundfont-loading" });
    this.api.loadSoundFontFromUrl?.(this.soundFontUrl, false);
  }

  seekTick(tick: number): void {
    this.api.tickPosition = tick;
  }

  setSpeed(speed: number): void {
    this.api.playbackSpeed = speed;
  }

  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void {
    this.api.playbackRange = range;
    this.api.isLooping = enabled;
  }

  setVisibleTracks(trackIds: string[]): void {
    this.api.renderTracks?.(trackIds.map(id => this.getTrack(id)));
  }

  setTrackMute(trackIdValue: string, muted: boolean): void {
    this.api.changeTrackMute?.([this.getTrack(trackIdValue)], muted);
  }

  setTrackSolo(trackIdValue: string, solo: boolean): void {
    this.api.changeTrackSolo?.([this.getTrack(trackIdValue)], solo);
  }

  setTrackVolume(trackIdValue: string, volume: number): void {
    const normalized = Math.min(1, Math.max(0, volume));
    this.api.changeTrackVolume?.([this.getTrack(trackIdValue)], normalized);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const detach of this.detachEvents.splice(0)) detach();
    this.listeners.clear();
    this.api.destroy?.();
  }

  private attachEvents(): void {
    this.attach(this.api.scoreLoaded, score => this.refreshTracks(score));
    this.attachVoid(this.api.playerReady, () => this.emit({ type: "ready" }));
    this.attach(this.api.playerStateChanged, value => {
      const event = value as { state?: number; stopped?: boolean };
      const state = event.state === 1 ? "playing" : event.stopped ? "stopped" : "paused";
      this.snapshot = { ...this.snapshot, transport: state };
      this.emit({ type: "transport", state });
    });
    this.attach(this.api.playerPositionChanged, value => {
      const event = value as { currentTime?: number; endTime?: number; tickPosition?: number };
      this.emit({
        type: "position",
        positionMs: event.currentTime ?? 0,
        endMs: event.endTime ?? this.api.endTime ?? 0,
        tick: event.tickPosition ?? this.api.tickPosition ?? 0,
      });
    });
    this.attach(this.api.soundFontLoad, () => {
      this.snapshot = { ...this.snapshot, soundFont: "loading" };
      this.emit({ type: "soundfont-loading" });
    });
    this.attachVoid(this.api.soundFontLoaded, () => {
      this.snapshot = { ...this.snapshot, soundFont: "ready" };
      this.emit({ type: "soundfont-ready" });
    });
    this.attach(this.api.error, value => {
      const error = asError(value, "alphaTab playback error");
      if (this.snapshot.soundFont !== "ready") {
        this.snapshot = { ...this.snapshot, soundFont: "error" };
        this.emit({ type: "soundfont-error", error });
      } else {
        this.emit({ type: "error", error });
      }
    });
  }

  private attach<T>(event: { on(handler: (value: T) => void): () => void } | undefined, handler: (value: T) => void): void {
    const detach = event?.on(handler);
    if (detach) this.detachEvents.push(detach);
  }

  private attachVoid(event: { on(handler: () => void): () => void } | undefined, handler: () => void): void {
    const detach = event?.on(handler);
    if (detach) this.detachEvents.push(detach);
  }

  private refreshTracks(score: AlphaTabBrowserScoreLike): void {
    this.tracks.clear();
    for (const track of score.tracks) this.tracks.set(trackId(track.index), track);
  }

  private getTrack(id: string): AlphaTabBrowserTrackLike {
    const track = this.tracks.get(id);
    if (!track) throw new Error(`Unknown alphaTab track: ${id}`);
    return track;
  }

  private emit(event: PlaybackEngineEvent): void {
    if (this.destroyed) return;
    for (const listener of this.listeners) listener(event);
  }
}

function trackId(index: number): string {
  return `track-${index}`;
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}
