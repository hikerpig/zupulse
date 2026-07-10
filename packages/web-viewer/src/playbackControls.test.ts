// @vitest-environment jsdom
// Migrated with the shared controls.
import { describe, expect, it } from "vitest";
import type {
  PlaybackCommand,
  PlaybackState,
  PlaybackTimelineMap,
} from "@tab-viewer/web-core";
import { mountPlaybackControls } from "./playbackControls";

const timeline: PlaybackTimelineMap = {
  durationTicks: 3840,
  durationMs: 8000,
  measures: [
    { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
    { id: "measure-1", index: 1, startTick: 1920, durationTicks: 1920, beatTicks: [1920, 2400, 2880, 3360] },
  ],
};

describe("mountPlaybackControls", () => {
  it("renders loop draft ranges from authoritative ticks before durationMs is ready", () => {
    document.body.innerHTML = controlsHtml();
    const state = playbackState();
    state.durationMs = 0;
    state.loopDraft = {
      snapMode: "beat",
      start: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
      end: { measureId: "measure-1", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 0 },
    };

    mountPlaybackControls(document, new FakeController(state), timeline);

    expect((document.querySelector("#loop-start") as HTMLInputElement).value).toBe("0");
    expect((document.querySelector("#loop-end") as HTMLInputElement).value).toBe("500");
  });

  it("dispatches transport, progress, speed, and loop commands", () => {
    document.body.innerHTML = controlsHtml();
    const controller = new FakeController(playbackState());
    mountPlaybackControls(document, controller, timeline);

    click("play-toggle");
    click("play-stop");
    click("soundfont-retry");
    click("loop-set-a");
    click("loop-set-b");
    click("loop-save");
    changeValue("play-speed", "75");
    changeValue("play-progress", "500");
    changeValue("loop-snap-mode", "measure");
    changeValue("loop-start", "250");
    changeChecked("loop-enabled", false);

    expect(controller.commands).toContainEqual({ type: "toggle-playback" });
    expect(controller.commands).toContainEqual({ type: "stop" });
    expect(controller.commands).toContainEqual({ type: "retry-soundfont" });
    expect(controller.commands).toContainEqual({
      type: "set-loop-boundary",
      boundary: "start",
      position: controller.state.position,
    });
    expect(controller.commands).toContainEqual({ type: "save-loop" });
    expect(controller.commands).toContainEqual({ type: "set-score-speed", speed: 0.75 });
    expect(controller.commands).toContainEqual({
      type: "seek",
      position: {
        measureId: "measure-1",
        measureIndex: 1,
        beatIndex: 0,
        tick: 1920,
        cachedTimeMs: 4000,
      },
    });
    expect(controller.commands).toContainEqual({ type: "set-loop-snap", mode: "measure" });
    expect(controller.commands).toContainEqual({
      type: "set-loop-boundary",
      boundary: "start",
      position: {
        measureId: "measure-0",
        measureIndex: 0,
        beatIndex: 2,
        tick: 960,
        cachedTimeMs: 2000,
      },
    });
    expect(controller.commands).toContainEqual({ type: "set-loop-enabled", enabled: false });
  });

  it("dispatches dynamic loop and track actions", () => {
    document.body.innerHTML = controlsHtml();
    const controller = new FakeController(playbackState());
    mountPlaybackControls(document, controller, timeline);

    clickSelector('[data-action="select-loop"]');
    changeSelector('[data-action="rename-loop"]', "Chorus");
    changeSelector('[data-action="loop-speed"]', "60");
    clickSelector('[data-action="delete-loop"]');
    changeSelector('[data-action="primary-track"][data-track-id="track-1"]', undefined, true);
    changeSelector('[data-action="additional-track"][data-track-id="track-1"]', undefined, true);
    changeSelector('[data-action="mute-track"][data-track-id="track-0"]', undefined, true);
    changeSelector('[data-action="solo-track"][data-track-id="track-0"]', undefined, true);
    changeSelector('[data-action="track-volume"][data-track-id="track-0"]', "45");

    expect(controller.commands).toContainEqual({ type: "select-loop", loopId: "loop-1" });
    expect(controller.commands).toContainEqual({ type: "rename-loop", loopId: "loop-1", label: "Chorus" });
    expect(controller.commands).toContainEqual({ type: "set-loop-speed", loopId: "loop-1", speed: 0.6 });
    expect(controller.commands).toContainEqual({ type: "delete-loop", loopId: "loop-1" });
    expect(controller.commands).toContainEqual({ type: "set-primary-track", trackId: "track-1" });
    expect(controller.commands).toContainEqual({ type: "set-additional-tracks", trackIds: ["track-1"] });
    expect(controller.commands).toContainEqual({ type: "set-track-mute", trackId: "track-0", muted: true });
    expect(controller.commands).toContainEqual({ type: "set-track-solo", trackId: "track-0", solo: true });
    expect(controller.commands).toContainEqual({ type: "set-track-volume", trackId: "track-0", volume: 0.45 });
  });

  it("removes DOM and controller listeners during cleanup", () => {
    document.body.innerHTML = controlsHtml();
    const controller = new FakeController(playbackState());
    const cleanup = mountPlaybackControls(document, controller, timeline);
    cleanup();

    click("play-toggle");
    controller.publish();

    expect(controller.commands).toEqual([]);
    expect(controller.subscribed).toBe(false);
  });
});

class FakeController {
  readonly commands: PlaybackCommand[] = [];
  listener: ((state: PlaybackState) => void) | undefined;
  subscribed = false;

  constructor(readonly state: PlaybackState) {}

  getState(): PlaybackState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listener = listener;
    this.subscribed = true;
    listener(this.getState());
    return () => {
      this.listener = undefined;
      this.subscribed = false;
    };
  }

  async dispatch(command: PlaybackCommand): Promise<void> {
    this.commands.push(command);
  }

  publish(): void {
    this.listener?.(this.getState());
  }
}

function playbackState(): PlaybackState {
  return {
    sessionId: "session-1",
    transport: "ready",
    position: { measureId: "measure-0", measureIndex: 0, beatIndex: 1, tick: 480, cachedTimeMs: 1000 },
    durationMs: 8000,
    scoreSpeed: 1,
    looping: true,
    activeLoopId: "loop-1",
    loopDraft: { snapMode: "beat" },
    loops: [{
      id: "loop-1",
      label: "Verse",
      labelSource: "user",
      start: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
      end: { measureId: "measure-1", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 4000 },
      snapMode: "beat",
      speedOverride: 0.55,
      createdAt: "2026-07-10T00:00:00Z",
      updatedAt: "2026-07-10T00:00:00Z",
    }],
    tracks: [
      { id: "track-0", sourceIndex: 0, name: "Lead" },
      { id: "track-1", sourceIndex: 1, name: "Bass" },
    ],
    trackState: {
      primaryVisibleTrackId: "track-0",
      additionalVisibleTrackIds: [],
      visibilityUpdatedAt: "2026-07-10T00:00:00Z",
      settings: {
        "track-0": {
          muted: false,
          solo: false,
          volume: 1,
          muteUpdatedAt: "2026-07-10T00:00:00Z",
          volumeUpdatedAt: "2026-07-10T00:00:00Z",
        },
        "track-1": {
          muted: false,
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

function controlsHtml(): string {
  return `
    <button id="play-toggle"></button><button id="play-stop"></button>
    <span id="play-current-time"></span><span id="play-duration"></span>
    <input id="play-progress" type="range" min="0" max="1000"><input id="play-speed" type="range" min="25" max="200">
    <output id="play-speed-value"></output><button id="soundfont-retry"></button>
    <input id="loop-enabled" type="checkbox"><button id="loop-set-a"></button>
    <button id="loop-set-b"></button><button id="loop-save"></button>
    <select id="loop-snap-mode"><option value="beat">beat</option><option value="measure">measure</option></select>
    <input id="loop-start" type="range" min="0" max="1000"><input id="loop-end" type="range" min="0" max="1000">
    <div id="loop-list"></div><div id="track-list"></div>
    <p id="playback-persistence-status"></p>
  `;
}

function click(id: string): void {
  (document.querySelector(`#${id}`) as HTMLElement).click();
}

function clickSelector(selector: string): void {
  (document.querySelector(selector) as HTMLElement).click();
}

function changeValue(id: string, value: string): void {
  changeSelector(`#${id}`, value);
}

function changeChecked(id: string, checked: boolean): void {
  changeSelector(`#${id}`, undefined, checked);
}

function changeSelector(selector: string, value?: string, checked?: boolean): void {
  const element = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  if (value !== undefined) element.value = value;
  if (checked !== undefined && element instanceof HTMLInputElement) element.checked = checked;
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
