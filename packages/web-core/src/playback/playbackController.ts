import type { ScoreIdentity } from "../score/types";
import type { SidecarPayload } from "../storage/sidecar";
import {
  createLoopRegion,
  getEffectivePlaybackSpeed,
  musicalPositionFromTick,
  normalizePlaybackSpeed,
  normalizeScorePlaybackSpeed,
  snapMusicalPosition,
} from "./loopRegions";
import type { PlaybackPersistence } from "./playbackPersistence";
import type {
  LoopRegion,
  PlaybackCommand,
  PlaybackEngine,
  PlaybackEngineEvent,
  PlaybackState,
  PlaybackTimelineMap,
  PlaybackTrack,
  TrackMixState,
  TrackPlaybackState,
} from "./types";
import { resolvePianoHandMapping } from "./pianoHandMapping";

type LoopRange = {
  start: LoopRegion["start"];
  end: LoopRegion["end"];
  speedOverride?: number | undefined;
};

export type PlaybackControllerOptions = {
  sessionId: string;
  identity: ScoreIdentity;
  engine: PlaybackEngine;
  persistence: PlaybackPersistence;
  baseSidecar: SidecarPayload;
  tracks: PlaybackTrack[];
  timeline: PlaybackTimelineMap;
  baseTempo?: number;
  clock?: { now(): string };
  ids?: { next(): string };
  schedule?: {
    set(delayMs: number, callback: () => void): unknown;
    clear(handle: unknown): void;
  };
};

const defaultClock = { now: () => new Date().toISOString() };
const defaultIds = { next: () => crypto.randomUUID() };
const defaultSchedule = {
  set: (delayMs: number, callback: () => void) => setTimeout(callback, delayMs),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class PlaybackController {
  private readonly listeners = new Set<(state: PlaybackState) => void>();
  private readonly clock: { now(): string };
  private readonly ids: { next(): string };
  private readonly schedule: NonNullable<PlaybackControllerOptions["schedule"]>;
  private state: PlaybackState;
  private sidecar: SidecarPayload;
  private detachEngine: (() => void) | undefined;
  private sidecarTimer?: unknown;
  private resumeTimer?: unknown;
  private positionPublicationTimer?: unknown;
  private sidecarDirty = false;
  private resumeDirty = false;
  private initialized = false;
  private destroyed = false;
  private countInActive = false;
  private readonly previewSeekTicks = new Set<number>();
  private sidecarWriteChain = Promise.resolve();
  private resumeWriteChain = Promise.resolve();

  constructor(private readonly options: PlaybackControllerOptions) {
    this.clock = options.clock ?? defaultClock;
    this.ids = options.ids ?? defaultIds;
    this.schedule = options.schedule ?? defaultSchedule;
    this.sidecar = structuredClone(options.baseSidecar);
    this.state = this.createState(this.sidecar);
  }

  getState(): PlaybackState {
    return structuredClone(this.state);
  }

  previewSeek(position: PlaybackState["position"]): void {
    if (this.destroyed) throw new Error("Playback controller is destroyed");
    this.previewSeekTicks.add(position.tick);
    if (this.previewSeekTicks.size > 8) {
      const oldest = this.previewSeekTicks.values().next().value;
      if (oldest !== undefined) this.previewSeekTicks.delete(oldest);
    }
    this.options.engine.seekTick(position.tick);
  }

  subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const sessionId = this.options.sessionId;
    this.detachEngine = this.options.engine.subscribe((event) => {
      if (this.destroyed || this.state.sessionId !== sessionId) return;
      this.reduceEngineEvent(event);
    });
    const snapshot = this.options.engine.getSnapshot();
    this.updateState({ soundFont: snapshot.soundFont });

    const [savedSidecar, resume] = await Promise.all([
      this.options.persistence.readSidecar(this.options.identity),
      this.options.persistence.readResume(this.options.identity),
    ]);
    if (this.destroyed) return;

    this.sidecar = structuredClone(savedSidecar ?? this.options.baseSidecar);
    this.state = this.createState(this.sidecar);
    this.state.soundFont = this.options.engine.getSnapshot().soundFont;
    await this.applyPersistedSettings();
    if (resume) {
      this.state.position = resume.position;
      this.options.engine.seekTick(resume.position.tick);
    }

    this.initialized = true;
    if (this.state.soundFont === "ready") this.state.transport = "ready";
    this.notify();
  }

  async dispatch(command: PlaybackCommand): Promise<void> {
    if (this.destroyed) throw new Error("Playback controller is destroyed");

    switch (command.type) {
      case "toggle-playback":
        if (this.state.soundFont === "ready") {
          this.options.engine.playPause(this.state.transport === "paused" ? { skipCountIn: true } : undefined);
        }
        return;
      case "pause":
        if (this.state.transport === "playing") this.options.engine.playPause();
        this.resumeDirty = true;
        await this.queueResumeWrite();
        return;
      case "stop":
        this.stop();
        await this.queueResumeWrite();
        return;
      case "retry-soundfont":
        this.updateState({ soundFont: "loading", transport: "loading" });
        this.options.engine.retrySoundFont();
        return;
      case "seek":
        this.state.position = command.position;
        this.options.engine.seekTick(command.position.tick);
        this.markResumeDirty();
        this.notify();
        return;
      case "set-score-speed":
        this.setScoreSpeed(command.speed);
        return;
      case "set-metronome":
        this.setRhythmEnabled("metronome", command.enabled);
        return;
      case "set-metronome-volume":
        this.setRhythmVolume("metronome", command.volume);
        return;
      case "set-count-in":
        this.setRhythmEnabled("countIn", command.enabled);
        return;
      case "set-count-in-volume":
        this.setRhythmVolume("countIn", command.volume);
        return;
      case "set-piano-hand-mode":
        await this.setPianoHandMode(command.mode);
        return;
      case "preview-piano-target-hand":
        await this.previewPianoTargetHand(command.active);
        return;
      case "set-loop-enabled":
        this.setLoopEnabled(command.enabled);
        return;
      case "set-loop-snap":
        this.state.loopDraft = { ...this.state.loopDraft, snapMode: command.mode };
        this.notify();
        return;
      case "set-loop-boundary":
        this.setLoopBoundary(command.boundary, command.position);
        return;
      case "commit-loop-draft":
        this.commitLoopDraft();
        return;
      case "select-loop":
        this.selectLoop(command.loopId);
        return;
      case "save-loop":
        this.saveLoop(command.label);
        return;
      case "rename-loop":
        this.renameLoop(command.loopId, command.label);
        return;
      case "delete-loop":
        this.deleteLoop(command.loopId);
        return;
      case "set-loop-speed":
        this.setLoopSpeed(command.loopId, command.speed);
        return;
      case "set-primary-track":
        this.setPrimaryTrack(command.trackId);
        return;
      case "set-additional-tracks":
        this.setAdditionalTracks(command.trackIds);
        return;
      case "set-track-mute":
        this.setTrackMute(command.trackId, command.muted);
        return;
      case "set-track-solo":
        this.setTrackSolo(command.trackId, command.solo);
        return;
      case "set-track-volume":
        this.setTrackVolume(command.trackId, command.volume);
        return;
      default:
        command satisfies never;
    }
  }

  async flush(): Promise<void> {
    if (this.positionPublicationTimer !== undefined) this.notify();
    this.clearTimers();
    await this.queueSidecarWrite();
    await this.queueResumeWrite();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    await this.flush();
    this.destroyed = true;
    this.detachEngine?.();
    this.detachEngine = undefined;
    this.previewSeekTicks.clear();
    this.options.engine.destroy();
    this.listeners.clear();
  }

  private createState(sidecar: SidecarPayload): PlaybackState {
    const now = this.clock.now();
    const playback = sidecar.practice.playback;
    const validTrackIds = new Set(this.options.tracks.map((track) => track.id));
    const fallbackPrimary = this.options.tracks[0]?.id ?? "";
    const primary =
      playback.visibility.primaryTrackId && validTrackIds.has(playback.visibility.primaryTrackId)
        ? playback.visibility.primaryTrackId
        : fallbackPrimary;
    const additional = playback.visibility.additionalTrackIds.filter((id) => id !== primary && validTrackIds.has(id));
    const settings: Record<string, TrackMixState> = {};
    for (const track of this.options.tracks) {
      const persisted = playback.tracks[track.id];
      settings[track.id] = {
        muted: persisted?.muted ?? false,
        solo: false,
        volume: persisted?.volume ?? 1,
        muteUpdatedAt: persisted?.muteUpdatedAt ?? now,
        volumeUpdatedAt: persisted?.volumeUpdatedAt ?? now,
      };
    }

    return {
      sessionId: this.options.sessionId,
      transport: "loading",
      position: musicalPositionFromTick(0, 0, this.options.timeline),
      durationMs: this.options.timeline.durationMs,
      baseTempo: this.options.baseTempo && this.options.baseTempo > 0 ? this.options.baseTempo : 120,
      scoreSpeed: normalizeScorePlaybackSpeed(playback.scoreSpeed.value),
      rhythm: structuredClone(playback.rhythm),
      pianoPractice: this.createPianoPracticeState(playback.pianoPractice.mode),
      looping: false,
      loopDraft: { snapMode: "beat" },
      loops: playback.loops.map((loop) => ({
        ...structuredClone(loop),
        start: rehydrateLegacyPosition(loop.start, this.options.timeline),
        end: rehydrateLegacyPosition(loop.end, this.options.timeline),
      })),
      tracks: structuredClone(this.options.tracks),
      trackState: {
        primaryVisibleTrackId: primary,
        additionalVisibleTrackIds: additional,
        visibilityUpdatedAt: playback.visibility.updatedAt,
        settings,
      },
      soundFont: "loading",
      persistence: "clean",
    };
  }

  private createPianoPracticeState(
    requestedMode: SidecarPayload["practice"]["playback"]["pianoPractice"]["mode"],
  ): PlaybackState["pianoPractice"] {
    const result = resolvePianoHandMapping(this.options.tracks);
    if (result.availability !== "available") {
      return {
        mode: "both-hands",
        requestedMode,
        availability: result.availability,
        unavailableCode: result.code,
        previewActive: false,
        pausedForAudioProjection: false,
      };
    }
    if (this.options.engine.getPianoHandAudioCapability(result.mapping) === "unsupported") {
      return {
        mode: "both-hands",
        requestedMode,
        availability: "audio-unsupported",
        unavailableCode: "piano-hand-practice-audio-unsupported",
        mapping: result.mapping,
        previewActive: false,
        pausedForAudioProjection: false,
      };
    }
    return {
      mode: requestedMode,
      requestedMode,
      availability: "available",
      mapping: result.mapping,
      previewActive: false,
      pausedForAudioProjection: false,
    };
  }

  private async applyPersistedSettings(): Promise<void> {
    const visible = this.visibleTrackIds();
    if (visible.length > 0) this.options.engine.setVisibleTracks(visible);
    this.options.engine.setSpeed(this.state.scoreSpeed);
    this.options.engine.setMetronomeVolume(
      this.state.rhythm.metronome.enabled ? this.state.rhythm.metronome.volume / 100 : 0,
    );
    this.options.engine.setCountInVolume(
      this.state.rhythm.countIn.enabled ? this.state.rhythm.countIn.volume / 100 : 0,
    );
    for (const track of this.options.tracks) {
      const mix = this.state.trackState.settings[track.id];
      if (!mix) continue;
      this.options.engine.setTrackMute(track.id, mix.muted);
      this.options.engine.setTrackVolume(track.id, mix.volume);
    }
    if (this.state.pianoPractice.availability === "available" && this.state.pianoPractice.mode !== "both-hands") {
      try {
        const result = await this.applyPianoAudioProjection(this.state.pianoPractice.mode, false);
        this.state.pianoPractice.pausedForAudioProjection = result.pausedForAudioProjection;
      } catch {
        this.markPianoAudioUnavailable(this.state.pianoPractice.requestedMode);
      }
    }
  }

  private reduceEngineEvent(event: PlaybackEngineEvent): void {
    switch (event.type) {
      case "ready":
        return;
      case "soundfont-loading":
        this.updateState({ soundFont: "loading", transport: "loading" });
        return;
      case "soundfont-ready":
        let transport = this.state.transport;
        if (this.initialized && transport === "loading") transport = "ready";
        this.updateState({
          soundFont: "ready",
          transport,
        });
        return;
      case "soundfont-error":
        this.updateState({ soundFont: "error", transport: "error", errorCode: "soundfont-load-failed" });
        return;
      case "transport":
        if (event.state === "stopped") this.countInActive = false;
        this.updateState({
          transport: event.state === "playing" && this.countInActive ? "counting-in" : event.state,
        });
        if (event.state !== "playing") void this.queueResumeWrite();
        return;
      case "count-in-started":
        this.countInActive = true;
        this.updateState({ transport: "counting-in" });
        return;
      case "count-in-ended":
        this.countInActive = false;
        this.updateState({ transport: "playing" });
        return;
      case "position":
        if (this.previewSeekTicks.delete(event.tick)) return;
        this.state.position = musicalPositionFromTick(event.tick, event.positionMs, this.options.timeline);
        this.state.durationMs = event.endMs;
        this.markResumeDirty();
        if (this.state.transport === "playing") this.schedulePositionPublication();
        else this.notify();
        return;
      case "error":
        this.countInActive = false;
        this.updateState({ transport: "error", errorCode: "playback-error" });
        return;
    }
  }

  private stop(): void {
    this.options.engine.stop();
    const loop = this.effectiveLoopRange();
    this.state.position =
      this.state.looping && loop ? loop.start : musicalPositionFromTick(0, 0, this.options.timeline);
    this.markResumeDirty();
    this.notify();
  }

  private setScoreSpeed(speed: number): void {
    const normalized = normalizeScorePlaybackSpeed(speed);
    const now = this.clock.now();
    this.state.scoreSpeed = normalized;
    this.sidecar.practice.playback.scoreSpeed = { value: normalized, updatedAt: now };
    this.options.engine.setSpeed(getEffectivePlaybackSpeed(normalized, this.activeLoop() ?? {}));
    this.markSidecarDirty();
    this.notify();
  }

  private setRhythmEnabled(kind: "metronome" | "countIn", enabled: boolean): void {
    const current = this.state.rhythm[kind];
    const next = { ...current, enabled, updatedAt: this.clock.now() };
    this.state.rhythm = { ...this.state.rhythm, [kind]: next };
    this.sidecar.practice.playback.rhythm = structuredClone(this.state.rhythm);
    this.applyRhythmSetting(kind);
    this.markSidecarDirty();
    this.notify();
  }

  private setRhythmVolume(kind: "metronome" | "countIn", volume: number): void {
    const current = this.state.rhythm[kind];
    const next = {
      ...current,
      volume: Math.min(100, Math.max(0, Math.round(volume))),
      updatedAt: this.clock.now(),
    };
    this.state.rhythm = { ...this.state.rhythm, [kind]: next };
    this.sidecar.practice.playback.rhythm = structuredClone(this.state.rhythm);
    this.applyRhythmSetting(kind);
    this.markSidecarDirty();
    this.notify();
  }

  private applyRhythmSetting(kind: "metronome" | "countIn"): void {
    const setting = this.state.rhythm[kind];
    const volume = setting.enabled ? setting.volume / 100 : 0;
    if (kind === "metronome") this.options.engine.setMetronomeVolume(volume);
    else this.options.engine.setCountInVolume(volume);
  }

  private async setPianoHandMode(mode: PlaybackState["pianoPractice"]["mode"]): Promise<void> {
    if (this.state.pianoPractice.availability !== "available") return;
    let result: { pausedForAudioProjection: boolean };
    try {
      result = await this.applyPianoAudioProjection(mode, false);
    } catch {
      this.markPianoAudioUnavailable(mode);
      return;
    }
    const now = this.clock.now();
    this.state.pianoPractice = {
      ...this.state.pianoPractice,
      mode,
      requestedMode: mode,
      previewActive: false,
      pausedForAudioProjection: result.pausedForAudioProjection,
    };
    this.sidecar.practice.playback.pianoPractice = { mode, updatedAt: now };
    this.markSidecarDirty();
    this.notify();
  }

  private async previewPianoTargetHand(active: boolean): Promise<void> {
    const practice = this.state.pianoPractice;
    if (practice.availability !== "available" || practice.mode === "both-hands" || practice.previewActive === active) {
      return;
    }
    let result: { pausedForAudioProjection: boolean };
    try {
      result = await this.applyPianoAudioProjection(practice.mode, active);
    } catch {
      this.markPianoAudioUnavailable(practice.requestedMode);
      return;
    }
    this.state.pianoPractice = {
      ...practice,
      previewActive: active,
      pausedForAudioProjection: result.pausedForAudioProjection,
    };
    this.notify();
  }

  private applyPianoAudioProjection(
    mode: PlaybackState["pianoPractice"]["mode"],
    previewTargetHand: boolean,
  ): Promise<{ pausedForAudioProjection: boolean }> {
    const mapping = this.state.pianoPractice.mapping;
    if (!mapping) throw new Error("Piano hand mapping is unavailable");
    let audibleStaffIds: string[];
    if (mode === "both-hands") {
      audibleStaffIds = [mapping.rightStaffId, mapping.leftStaffId];
    } else if (mode === "right-hand") {
      audibleStaffIds = [previewTargetHand ? mapping.rightStaffId : mapping.leftStaffId];
    } else {
      audibleStaffIds = [previewTargetHand ? mapping.leftStaffId : mapping.rightStaffId];
    }
    return this.options.engine.setPianoStaffAudio(mapping, audibleStaffIds);
  }

  private markPianoAudioUnavailable(requestedMode: PlaybackState["pianoPractice"]["mode"]): void {
    this.state.pianoPractice = {
      ...this.state.pianoPractice,
      mode: "both-hands",
      requestedMode,
      availability: "audio-unsupported",
      unavailableCode: "piano-hand-practice-audio-unsupported",
      previewActive: false,
      pausedForAudioProjection: false,
    };
    this.notify();
  }

  private setLoopBoundary(boundary: "start" | "end", position: PlaybackState["position"]): void {
    const snapped = snapMusicalPosition(position, this.state.loopDraft.snapMode, this.options.timeline);
    const opposite = boundary === "start" ? this.state.loopDraft.end : this.state.loopDraft.start;
    if (opposite && (boundary === "start" ? snapped.tick >= opposite.tick : snapped.tick <= opposite.tick)) return;
    this.state.loopDraft = { ...this.state.loopDraft, [boundary]: snapped };
    this.notify();
  }

  private commitLoopDraft(): void {
    const draft = this.validLoopDraft();
    if (!draft) return;
    delete this.state.activeLoopId;
    this.state.looping = true;
    this.options.engine.setLoop(loopTicks(draft), true);
    this.options.engine.setSpeed(this.state.scoreSpeed);
    this.notify();
  }

  private saveLoop(label?: string): void {
    const { start, end, snapMode } = this.state.loopDraft;
    if (!start || !end) throw new Error("Loop draft requires both boundaries");
    const input: Parameters<typeof createLoopRegion>[0] = {
      id: this.ids.next(),
      start,
      end,
      now: this.clock.now(),
      snapMode,
    };
    if (label !== undefined) input.label = label;
    const loop = createLoopRegion(input);
    this.state.loops = [...this.state.loops, loop];
    this.sidecar.practice.playback.loops = structuredClone(this.state.loops);
    this.state.activeLoopId = loop.id;
    this.state.looping = true;
    this.options.engine.setLoop(loopTicks(loop), true);
    this.options.engine.seekTick(loop.start.tick);
    this.options.engine.setSpeed(getEffectivePlaybackSpeed(this.state.scoreSpeed, loop));
    this.markSidecarDirty();
    this.notify();
  }

  private selectLoop(loopId: string): void {
    const loop = this.requireLoop(loopId);
    this.state.activeLoopId = loop.id;
    this.state.loopDraft = {
      start: structuredClone(loop.start),
      end: structuredClone(loop.end),
      snapMode: loop.snapMode,
    };
    this.state.looping = true;
    this.state.position = loop.start;
    this.options.engine.setLoop(loopTicks(loop), true);
    this.options.engine.seekTick(loop.start.tick);
    this.options.engine.setSpeed(getEffectivePlaybackSpeed(this.state.scoreSpeed, loop));
    this.markResumeDirty();
    this.notify();
  }

  private setLoopEnabled(enabled: boolean): void {
    if (!enabled) {
      this.state.looping = false;
      this.options.engine.setLoop(null, false);
      this.options.engine.setSpeed(this.state.scoreSpeed);
      this.notify();
      return;
    }
    const loop = this.effectiveLoopRange();
    if (!loop) throw new Error("No active loop region");
    this.state.looping = true;
    this.options.engine.setLoop(loopTicks(loop), true);
    this.options.engine.setSpeed(getEffectivePlaybackSpeed(this.state.scoreSpeed, loop));
    this.notify();
  }

  private validLoopDraft(): LoopRange | undefined {
    const { start, end } = this.state.loopDraft;
    return start && end && start.tick < end.tick ? { start, end } : undefined;
  }

  private effectiveLoopRange(): LoopRange | undefined {
    return this.activeLoop() ?? this.validLoopDraft();
  }

  private renameLoop(loopId: string, label: string): void {
    const normalized = label.trim();
    if (!normalized) throw new Error("Loop label cannot be empty");
    this.replaceLoop(loopId, (loop) => ({
      ...loop,
      label: normalized,
      labelSource: "user",
      updatedAt: this.clock.now(),
    }));
  }

  private deleteLoop(loopId: string): void {
    const now = this.clock.now();
    this.replaceLoop(loopId, (loop) => ({ ...loop, updatedAt: now, deletedAt: now }));
    if (this.state.activeLoopId === loopId) {
      delete this.state.activeLoopId;
      this.state.looping = false;
      this.options.engine.setLoop(null, false);
      this.options.engine.setSpeed(this.state.scoreSpeed);
      this.notify();
    }
  }

  private setLoopSpeed(loopId: string, speed?: number): void {
    this.replaceLoop(loopId, (loop) => {
      const updated = { ...loop, updatedAt: this.clock.now() };
      if (speed === undefined) {
        delete updated.speedOverride;
      } else {
        updated.speedOverride = normalizePlaybackSpeed(speed);
      }
      return updated;
    });
    const loop = this.requireLoop(loopId);
    if (this.state.activeLoopId === loopId && this.state.looping) {
      this.options.engine.setSpeed(getEffectivePlaybackSpeed(this.state.scoreSpeed, loop));
    }
  }

  private replaceLoop(loopId: string, update: (loop: LoopRegion) => LoopRegion): void {
    this.requireLoop(loopId);
    this.state.loops = this.state.loops.map((loop) => (loop.id === loopId ? update(loop) : loop));
    this.sidecar.practice.playback.loops = structuredClone(this.state.loops);
    this.markSidecarDirty();
    this.notify();
  }

  private setPrimaryTrack(trackId: string): void {
    this.requireTrack(trackId);
    const now = this.clock.now();
    this.state.trackState = {
      ...this.state.trackState,
      primaryVisibleTrackId: trackId,
      additionalVisibleTrackIds: this.state.trackState.additionalVisibleTrackIds.filter((id) => id !== trackId),
      visibilityUpdatedAt: now,
    };
    this.persistVisibility(now);
  }

  private setAdditionalTracks(trackIds: string[]): void {
    const unique = [...new Set(trackIds)].filter((id) => id !== this.state.trackState.primaryVisibleTrackId);
    for (const id of unique) this.requireTrack(id);
    const now = this.clock.now();
    this.state.trackState = {
      ...this.state.trackState,
      additionalVisibleTrackIds: unique,
      visibilityUpdatedAt: now,
    };
    this.persistVisibility(now);
  }

  private persistVisibility(now: string): void {
    this.sidecar.practice.playback.visibility = {
      primaryTrackId: this.state.trackState.primaryVisibleTrackId,
      additionalTrackIds: [...this.state.trackState.additionalVisibleTrackIds],
      updatedAt: now,
    };
    this.options.engine.setVisibleTracks(this.visibleTrackIds());
    this.markSidecarDirty();
    this.notify();
  }

  private setTrackMute(trackId: string, muted: boolean): void {
    const mix = this.requireTrackMix(trackId);
    const now = this.clock.now();
    this.updateTrackMix(trackId, { ...mix, muted, muteUpdatedAt: now });
    this.options.engine.setTrackMute(trackId, muted);
    this.persistTrackMix(trackId);
  }

  private setTrackSolo(trackId: string, solo: boolean): void {
    const mix = this.requireTrackMix(trackId);
    this.updateTrackMix(trackId, { ...mix, solo });
    this.options.engine.setTrackSolo(trackId, solo);
    this.notify();
  }

  private setTrackVolume(trackId: string, volume: number): void {
    const mix = this.requireTrackMix(trackId);
    const normalized = Math.min(1, Math.max(0, volume));
    const now = this.clock.now();
    this.updateTrackMix(trackId, { ...mix, volume: normalized, volumeUpdatedAt: now });
    this.options.engine.setTrackVolume(trackId, normalized);
    this.persistTrackMix(trackId);
  }

  private updateTrackMix(trackId: string, mix: TrackMixState): void {
    this.state.trackState = {
      ...this.state.trackState,
      settings: { ...this.state.trackState.settings, [trackId]: mix },
    };
  }

  private persistTrackMix(trackId: string): void {
    const mix = this.requireTrackMix(trackId);
    this.sidecar.practice.playback.tracks[trackId] = {
      muted: mix.muted,
      volume: mix.volume,
      muteUpdatedAt: mix.muteUpdatedAt,
      volumeUpdatedAt: mix.volumeUpdatedAt,
    };
    this.markSidecarDirty();
    this.notify();
  }

  private markSidecarDirty(): void {
    this.sidecarDirty = true;
    this.updateState({ persistence: "unsaved" });
    if (this.sidecarTimer !== undefined) this.schedule.clear(this.sidecarTimer);
    this.sidecarTimer = this.schedule.set(500, () => {
      this.sidecarTimer = undefined;
      void this.queueSidecarWrite();
    });
  }

  private markResumeDirty(): void {
    this.resumeDirty = true;
    if (this.resumeTimer !== undefined) return;
    this.resumeTimer = this.schedule.set(5000, () => {
      this.resumeTimer = undefined;
      void this.queueResumeWrite();
    });
  }

  private queueSidecarWrite(): Promise<void> {
    this.sidecarWriteChain = this.sidecarWriteChain.then(async () => {
      if (!this.sidecarDirty) return;
      const payload = structuredClone(this.sidecar);
      this.sidecarDirty = false;
      this.updateState({ persistence: "saving" });
      try {
        await this.options.persistence.writeSidecar(this.options.identity, payload);
        this.updateState({ persistence: this.sidecarDirty ? "unsaved" : "clean" });
      } catch {
        this.sidecarDirty = true;
        this.updateState({ persistence: "error" });
      }
    });
    return this.sidecarWriteChain;
  }

  private queueResumeWrite(): Promise<void> {
    if (this.resumeTimer !== undefined) {
      this.schedule.clear(this.resumeTimer);
      this.resumeTimer = undefined;
    }
    this.resumeWriteChain = this.resumeWriteChain.then(async () => {
      if (!this.resumeDirty) return;
      const resume = {
        position: structuredClone(this.state.position),
        updatedAt: this.clock.now(),
      };
      this.resumeDirty = false;
      try {
        await this.options.persistence.writeResume(this.options.identity, resume);
      } catch {
        this.resumeDirty = true;
      }
    });
    return this.resumeWriteChain;
  }

  private clearTimers(): void {
    if (this.sidecarTimer !== undefined) this.schedule.clear(this.sidecarTimer);
    if (this.resumeTimer !== undefined) this.schedule.clear(this.resumeTimer);
    if (this.positionPublicationTimer !== undefined) this.schedule.clear(this.positionPublicationTimer);
    this.sidecarTimer = undefined;
    this.resumeTimer = undefined;
    this.positionPublicationTimer = undefined;
  }

  private activeLoop(): LoopRegion | undefined {
    return this.state.activeLoopId === undefined
      ? undefined
      : this.state.loops.find((loop) => loop.id === this.state.activeLoopId && !loop.deletedAt);
  }

  private requireLoop(loopId: string): LoopRegion {
    const loop = this.state.loops.find((item) => item.id === loopId && !item.deletedAt);
    if (!loop) throw new Error(`Unknown playback loop: ${loopId}`);
    return loop;
  }

  private requireTrack(trackId: string): void {
    if (!this.options.tracks.some((track) => track.id === trackId)) {
      throw new Error(`Unknown playback track: ${trackId}`);
    }
  }

  private requireTrackMix(trackId: string): TrackMixState {
    this.requireTrack(trackId);
    const mix = this.state.trackState.settings[trackId];
    if (!mix) throw new Error(`Missing playback track settings: ${trackId}`);
    return mix;
  }

  private visibleTrackIds(): string[] {
    const primary = this.state.trackState.primaryVisibleTrackId;
    return primary
      ? [primary, ...this.state.trackState.additionalVisibleTrackIds]
      : [...this.state.trackState.additionalVisibleTrackIds];
  }

  private updateState(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private notify(): void {
    if (this.positionPublicationTimer !== undefined) {
      this.schedule.clear(this.positionPublicationTimer);
      this.positionPublicationTimer = undefined;
    }
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  private schedulePositionPublication(): void {
    if (this.positionPublicationTimer !== undefined) return;
    this.positionPublicationTimer = this.schedule.set(100, () => {
      this.positionPublicationTimer = undefined;
      this.notify();
    });
  }
}

function rehydrateLegacyPosition(position: LoopRegion["start"], timeline: PlaybackTimelineMap): LoopRegion["start"] {
  return position.measureIndex < 0
    ? musicalPositionFromTick(position.tick, position.cachedTimeMs, timeline)
    : structuredClone(position);
}

function loopTicks(loop: LoopRange) {
  return { startTick: loop.start.tick, endTick: loop.end.tick };
}
