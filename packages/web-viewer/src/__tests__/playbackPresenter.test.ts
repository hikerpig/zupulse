// Migrated with the shared presenter.
import { describe, expect, it } from "vitest";
import type { PlaybackState } from "@zupulse/web-core";
import { presentPlayback } from "../features/playback-workspace/model/playback-presenter";

describe("presentPlayback", () => {
  it("formats transport, time, progress, loops, and independent track state", () => {
    const view = presentPlayback(state());

    expect(view).toMatchObject({
      isPlaying: true,
      playDisabled: false,
      currentTime: "1:05",
      duration: "2:05",
      progress: 0.52,
      speedPercent: 80,
      looping: true,
      loopDraftStart: 0.08,
      loopDraftEnd: 0.4,
      loopSnapMode: "beat",
      soundFont: "ready",
      persistence: "clean",
      trackCount: 2,
      primaryTrackName: "Lead Guitar",
    });
    expect(view.loops).toEqual([
      {
        id: "loop-1",
        label: "Solo",
        labelSource: "user",
        startMeasureIndex: 0,
        endMeasureIndex: 1,
        speedPercent: 55,
        selected: true,
      },
    ]);
    expect(view.tracks[0]).toEqual({
      id: "track-0",
      sourceIndex: 0,
      name: "Lead Guitar",
      primary: true,
      additional: false,
      muted: false,
      solo: true,
      volumePercent: 70,
    });
  });

  it("exposes semantic soundfont state without presentation copy", () => {
    const loading = state();
    loading.soundFont = "loading";
    expect(presentPlayback(loading).playDisabled).toBe(true);

    loading.soundFont = "error";
    expect(presentPlayback(loading).soundFont).toBe("error");
  });

  it("never renders NaN and exposes persistence state", () => {
    const input = state();
    input.position.cachedTimeMs = Number.NaN;
    input.durationMs = 0;
    input.persistence = "error";

    expect(presentPlayback(input)).toMatchObject({
      currentTime: "0:00",
      duration: "0:00",
      progress: 0,
      persistence: "error",
    });
  });
});

function state(): PlaybackState {
  return {
    sessionId: "session-1",
    transport: "playing",
    position: {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 1000,
      cachedTimeMs: 65000,
    },
    durationMs: 125000,
    baseTempo: 120,
    scoreSpeed: 0.8,
    looping: true,
    activeLoopId: "loop-1",
    loopDraft: {
      snapMode: "beat",
      start: {
        measureId: "measure-0",
        measureIndex: 0,
        beatIndex: 0,
        tick: 800,
        cachedTimeMs: 10000,
      },
      end: {
        measureId: "measure-1",
        measureIndex: 1,
        beatIndex: 0,
        tick: 1600,
        cachedTimeMs: 50000,
      },
    },
    loops: [
      {
        id: "loop-1",
        label: "Solo",
        labelSource: "user",
        start: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
        end: {
          measureId: "measure-1",
          measureIndex: 1,
          beatIndex: 0,
          tick: 1920,
          cachedTimeMs: 4000,
        },
        snapMode: "beat",
        speedOverride: 0.55,
        createdAt: "2026-07-10T00:00:00Z",
        updatedAt: "2026-07-10T00:00:00Z",
      },
      {
        id: "deleted",
        label: "Deleted",
        labelSource: "user",
        start: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
        end: {
          measureId: "measure-1",
          measureIndex: 1,
          beatIndex: 0,
          tick: 1920,
          cachedTimeMs: 4000,
        },
        snapMode: "beat",
        createdAt: "2026-07-10T00:00:00Z",
        updatedAt: "2026-07-10T01:00:00Z",
        deletedAt: "2026-07-10T01:00:00Z",
      },
    ],
    tracks: [
      { id: "track-0", sourceIndex: 0, name: "Lead Guitar" },
      { id: "track-1", sourceIndex: 1, name: "Bass" },
    ],
    trackState: {
      primaryVisibleTrackId: "track-0",
      additionalVisibleTrackIds: ["track-1"],
      visibilityUpdatedAt: "2026-07-10T00:00:00Z",
      settings: {
        "track-0": {
          muted: false,
          solo: true,
          volume: 0.7,
          muteUpdatedAt: "2026-07-10T00:00:00Z",
          volumeUpdatedAt: "2026-07-10T00:00:00Z",
        },
        "track-1": {
          muted: true,
          solo: false,
          volume: 1,
          muteUpdatedAt: "2026-07-10T00:00:00Z",
          volumeUpdatedAt: "2026-07-10T00:00:00Z",
        },
      },
    },
    soundFont: "ready",
    persistence: "clean",
  };
}
