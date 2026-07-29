import type { AlphaTabApiLike, AlphaTabBrowserScoreLike, AlphaTabBrowserTrackLike } from "../gp/alphaTabBrowser";
import type {
  PlaybackEngine,
  PlaybackEngineEvent,
  PlaybackEngineSnapshot,
  PianoHandMapping,
  PlaybackTimelineMap,
  PlaybackTrack,
} from "./types";
import type { PlaybackOccurrence } from "../score/positions";
import * as alphaTab from "@coderline/alphatab";
import { buildAlphaTabStaffAudioProjection, type AlphaTabStaffAudioProjection } from "./alphaTabStaffAudioProjection";

export function extractAlphaTabPlaybackModel(api: AlphaTabApiLike): {
  baseTempo: number;
  tracks: PlaybackTrack[];
  timeline: PlaybackTimelineMap;
} {
  const score = api.score;
  if (!score) throw new Error("alphaTab score is not loaded");

  const measures = score.masterBars.map((masterBar) => {
    const durationTicks = masterBar.calculateDuration(true);
    const beatCount = Math.max(1, masterBar.timeSignatureNumerator ?? 4);
    const beatDuration = durationTicks / beatCount;
    return {
      id: `measure-${masterBar.index}`,
      index: masterBar.index,
      startTick: masterBar.start,
      durationTicks,
      beatTicks: Array.from({ length: beatCount }, (_, beatIndex) => masterBar.start + beatDuration * beatIndex),
    };
  });
  const finalMeasure = measures.at(-1);
  const scoreDurationTicks = finalMeasure ? finalMeasure.startTick + finalMeasure.durationTicks : 0;

  return {
    baseTempo: score.tempo && score.tempo > 0 ? score.tempo : 120,
    tracks: score.tracks.map((track) => {
      const name = track.name?.trim();
      return {
        id: trackId(track.index),
        sourceIndex: track.index,
        ...(name ? { name } : {}),
        staves: (track.staves ?? []).map((staff) => ({
          id: `${trackId(track.index)}:staff-${staff.index}`,
          sourceIndex: staff.index,
          isPercussion: staff.isPercussion,
        })),
      };
    }),
    timeline: {
      durationTicks: api.endTick && api.endTick > 0 ? api.endTick : scoreDurationTicks,
      durationMs: api.endTime ?? 0,
      measures,
    },
  };
}

export function extractAlphaTabPlaybackOccurrences(
  api: AlphaTabApiLike,
  trackIdValue = "track-0",
  timeline: PlaybackTimelineMap = extractAlphaTabPlaybackModel(api).timeline,
): PlaybackOccurrence[] {
  const expandedBars = api.tickCache?.masterBars;
  if (!expandedBars?.length) return [];

  const occurrenceCounts = new Map<number, number>();
  const occurrences: PlaybackOccurrence[] = [];
  expandedBars.forEach((lookup, pathIndex) => {
    const measure = timeline.measures.find((candidate) => candidate.index === lookup.masterBar.index);
    if (!measure || !Number.isFinite(lookup.start)) return;
    const occurrenceIndex = occurrenceCounts.get(measure.index) ?? 0;
    occurrenceCounts.set(measure.index, occurrenceIndex + 1);
    measure.beatTicks.forEach((writtenTick, beatIndex) => {
      occurrences.push({
        schemaVersion: 1,
        written: {
          schemaVersion: 1,
          trackId: trackIdValue,
          measureIndex: measure.index,
          beatIndex,
          tick: writtenTick,
        },
        occurrenceIndex,
        timelineTick: lookup.start + writtenTick - measure.startTick,
        path: [pathIndex],
      });
    });
  });
  return occurrences;
}

export function waitForAlphaTabScore(api: AlphaTabApiLike): Promise<AlphaTabBrowserScoreLike> {
  if (api.score) return Promise.resolve(api.score);
  if (!api.scoreLoaded) return Promise.reject(new Error("alphaTab scoreLoaded event is unavailable"));

  return new Promise((resolve) => {
    const detach = api.scoreLoaded?.on((score) => {
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
  private countInVolume = 0;
  private countInPlayingEvents = -1;
  private readonly trackMutes = new Map<string, boolean>();
  private readonly trackSolos = new Map<string, boolean>();
  private readonly trackVolumes = new Map<string, number>();

  constructor(
    private readonly api: AlphaTabApiLike,
    private readonly soundFontUrl: string,
    private readonly buildStaffAudioProjection: (
      score: alphaTab.model.Score,
      settings: alphaTab.Settings,
      audibleStaffIds: ReadonlySet<string>,
    ) => AlphaTabStaffAudioProjection = buildAlphaTabStaffAudioProjection,
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

  playPause(options: { skipCountIn?: boolean } = {}): void {
    const startsCountIn = !options.skipCountIn && this.snapshot.transport !== "playing" && this.countInVolume > 0;
    if (startsCountIn) {
      this.countInPlayingEvents = 0;
      this.emit({ type: "count-in-started" });
    }
    if (options.skipCountIn && this.countInVolume > 0) this.api.countInVolume = 0;
    this.api.playPause?.();
    if (options.skipCountIn && this.countInVolume > 0) this.api.countInVolume = this.countInVolume;
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

  setMetronomeVolume(volume: number): void {
    this.api.metronomeVolume = normalizeVolume(volume);
  }

  setCountInVolume(volume: number): void {
    this.countInVolume = normalizeVolume(volume);
    this.api.countInVolume = this.countInVolume;
  }

  getPianoHandAudioCapability(_mapping: PianoHandMapping): "supported" | "unsupported" {
    return this.api.player && this.api.score && this.api.settings ? "supported" : "unsupported";
  }

  async setPianoStaffAudio(
    _mapping: PianoHandMapping,
    audibleStaffIds: string[],
  ): Promise<{ pausedForAudioProjection: boolean }> {
    const player = this.api.player;
    const score = this.api.score;
    const settings = this.api.settings;
    if (!player || !score || !settings) throw new Error("alphaTab staff audio projection is unavailable");
    repairAlphaTabWorkerLoadedMidiInfo(player);

    const projection = this.buildStaffAudioProjection(
      score as alphaTab.model.Score,
      settings as alphaTab.Settings,
      new Set(audibleStaffIds),
    );
    const position = this.api.tickPosition ?? 0;
    const wasPlaying = this.snapshot.transport === "playing";
    if (wasPlaying) this.api.playPause?.();

    const loaded = new Promise<void>((resolve, reject) => {
      const handleLoaded = () => {
        player.midiLoaded.off(handleLoaded);
        player.midiLoadFailed.off(handleFailed);
        resolve();
      };
      const handleFailed = (error: Error) => {
        player.midiLoaded.off(handleLoaded);
        player.midiLoadFailed.off(handleFailed);
        reject(error);
      };
      player.midiLoaded.on(handleLoaded);
      player.midiLoadFailed.on(handleFailed);
    });
    player.loadMidiFile(projection.midiFile);
    player.loadBackingTrack(projection.score);
    player.updateSyncPoints(projection.syncPoints);
    player.applyTranspositionPitches(projection.transpositionPitches);
    try {
      await loaded;
      this.api.tickPosition = position;
    } finally {
      this.reapplyTrackMixer();
      if (wasPlaying) this.playPause({ skipCountIn: true });
    }
    return { pausedForAudioProjection: wasPlaying };
  }

  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void {
    this.api.playbackRange = range;
    this.api.isLooping = enabled;
  }

  setVisibleTracks(trackIds: string[]): void {
    this.api.renderTracks?.(trackIds.map((id) => this.getTrack(id)));
  }

  setTrackMute(trackIdValue: string, muted: boolean): void {
    this.trackMutes.set(trackIdValue, muted);
    this.api.changeTrackMute?.([this.getTrack(trackIdValue)], muted);
  }

  setTrackSolo(trackIdValue: string, solo: boolean): void {
    this.trackSolos.set(trackIdValue, solo);
    this.api.changeTrackSolo?.([this.getTrack(trackIdValue)], solo);
  }

  setTrackVolume(trackIdValue: string, volume: number): void {
    const normalized = Math.min(1, Math.max(0, volume));
    this.trackVolumes.set(trackIdValue, normalized);
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
    this.attach(this.api.scoreLoaded, (score) => this.refreshTracks(score));
    this.attachVoid(this.api.playerReady, () => this.emit({ type: "ready" }));
    this.attach(this.api.playerStateChanged, (value) => {
      const event = value as { state?: number; stopped?: boolean };
      const state = event.state === 1 ? "playing" : event.stopped ? "stopped" : "paused";
      this.snapshot = { ...this.snapshot, transport: state };
      if (state === "playing" && this.countInPlayingEvents >= 0) {
        this.countInPlayingEvents += 1;
        if (this.countInPlayingEvents === 2) {
          this.countInPlayingEvents = -1;
          this.emit({ type: "count-in-ended" });
        }
      } else if (state === "stopped") {
        this.countInPlayingEvents = -1;
      }
      this.emit({ type: "transport", state });
    });
    this.attach(this.api.playerPositionChanged, (value) => {
      const event = value as { currentTime?: number; endTime?: number; tickPosition?: number };
      if (this.countInPlayingEvents >= 0) {
        this.countInPlayingEvents = -1;
        this.emit({ type: "count-in-ended" });
      }
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
    this.attach(this.api.error, (value) => {
      const error = asError(value, "alphaTab playback error");
      if (this.snapshot.soundFont !== "ready") {
        this.snapshot = { ...this.snapshot, soundFont: "error" };
        this.emit({ type: "soundfont-error", error });
      } else {
        this.emit({ type: "error", error });
      }
    });
  }

  private attach<T>(
    event: { on(handler: (value: T) => void): () => void } | undefined,
    handler: (value: T) => void,
  ): void {
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

  private reapplyTrackMixer(): void {
    for (const [trackIdValue, muted] of this.trackMutes) {
      this.api.changeTrackMute?.([this.getTrack(trackIdValue)], muted);
    }
    for (const [trackIdValue, solo] of this.trackSolos) {
      this.api.changeTrackSolo?.([this.getTrack(trackIdValue)], solo);
    }
    for (const [trackIdValue, volume] of this.trackVolumes) {
      this.api.changeTrackVolume?.([this.getTrack(trackIdValue)], volume);
    }
  }

  private emit(event: PlaybackEngineEvent): void {
    if (this.destroyed) return;
    for (const listener of this.listeners) listener(event);
  }
}

function normalizeVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function repairAlphaTabWorkerLoadedMidiInfo(player: alphaTab.synth.IAlphaSynth): void {
  // alphaTab 1.8.4's worker getter recursively reads itself; MIDI reload reaches it after midiLoaded.
  const instance = (
    player as alphaTab.synth.IAlphaSynth & {
      _instance?: { _loadedMidiInfo?: unknown };
    }
  )._instance;
  if (!instance || !("_loadedMidiInfo" in instance)) return;
  Object.defineProperty(instance, "loadedMidiInfo", {
    configurable: true,
    get() {
      return instance._loadedMidiInfo;
    },
  });
}

function trackId(index: number): string {
  return `track-${index}`;
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}
