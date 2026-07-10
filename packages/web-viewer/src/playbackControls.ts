// Shared viewer playback controls.
import {
  musicalPositionFromTick,
  type PlaybackCommand,
  type PlaybackState,
  type PlaybackTimelineMap,
} from "@tab-viewer/web-core";
import { presentPlayback } from "./playbackPresenter";

export type PlaybackControllerLike = {
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  dispatch(command: PlaybackCommand): Promise<void>;
};

export function mountPlaybackControls(
  ownerDocument: Document,
  controller: PlaybackControllerLike,
  timeline: PlaybackTimelineMap,
): () => void {
  const elements = queryElements(ownerDocument);
  const cleanups: Array<() => void> = [];

  listen(elements.playToggle, "click", () => dispatch({ type: "toggle-playback" }));
  listen(elements.playStop, "click", () => dispatch({ type: "stop" }));
  listen(elements.soundFontRetry, "click", () => dispatch({ type: "retry-soundfont" }));
  listen(elements.playProgress, "change", () => dispatch({
    type: "seek",
    position: positionFromRange(elements.playProgress, timeline),
  }));
  listen(elements.playSpeed, "input", () => {
    elements.playSpeedValue.textContent = `${elements.playSpeed.value}%`;
  });
  listen(elements.playSpeed, "change", () => dispatch({
    type: "set-score-speed",
    speed: Number(elements.playSpeed.value) / 100,
  }));
  listen(elements.loopEnabled, "change", () => dispatch({
    type: "set-loop-enabled",
    enabled: elements.loopEnabled.checked,
  }));
  listen(elements.loopSetA, "click", () => setBoundary("start", controller.getState().position));
  listen(elements.loopSetB, "click", () => setBoundary("end", controller.getState().position));
  listen(elements.loopSave, "click", () => dispatch({ type: "save-loop" }));
  listen(elements.loopSnapMode, "change", () => dispatch({
    type: "set-loop-snap",
    mode: elements.loopSnapMode.value as PlaybackState["loopDraft"]["snapMode"],
  }));
  listen(elements.loopStart, "change", () => setBoundary(
    "start",
    positionFromRange(elements.loopStart, timeline),
  ));
  listen(elements.loopEnd, "change", () => setBoundary(
    "end",
    positionFromRange(elements.loopEnd, timeline),
  ));
  listen(elements.loopList, "click", handleLoopClick);
  listen(elements.loopList, "change", handleLoopChange);
  listen(elements.trackList, "change", handleTrackChange);

  const unsubscribe = controller.subscribe(render);
  cleanups.push(unsubscribe);

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };

  function dispatch(command: PlaybackCommand): void {
    void controller.dispatch(command);
  }

  function setBoundary(
    boundary: "start" | "end",
    position: PlaybackState["position"],
  ): void {
    dispatch({ type: "set-loop-boundary", boundary, position });
  }

  function listen(
    target: EventTarget,
    type: string,
    listener: (event: Event) => void,
  ): void {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  }

  function handleLoopClick(event: Event): void {
    const target = event.target as HTMLElement;
    const loopId = target.dataset.loopId;
    if (!loopId) return;
    if (target.dataset.action === "select-loop") dispatch({ type: "select-loop", loopId });
    if (target.dataset.action === "delete-loop") dispatch({ type: "delete-loop", loopId });
  }

  function handleLoopChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const loopId = target.dataset.loopId;
    if (!loopId) return;
    if (target.dataset.action === "rename-loop") {
      dispatch({ type: "rename-loop", loopId, label: target.value });
    }
    if (target.dataset.action === "loop-speed") {
      const speed = target.value === "" ? undefined : Number(target.value) / 100;
      const command: PlaybackCommand = { type: "set-loop-speed", loopId };
      if (speed !== undefined) command.speed = speed;
      dispatch(command);
    }
  }

  function handleTrackChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const trackId = target.dataset.trackId;
    if (!trackId) return;
    switch (target.dataset.action) {
      case "primary-track":
        dispatch({ type: "set-primary-track", trackId });
        return;
      case "additional-track": {
        const current = controller.getState().trackState.additionalVisibleTrackIds;
        const trackIds = target.checked
          ? [...new Set([...current, trackId])]
          : current.filter(id => id !== trackId);
        dispatch({ type: "set-additional-tracks", trackIds });
        return;
      }
      case "mute-track":
        dispatch({ type: "set-track-mute", trackId, muted: target.checked });
        return;
      case "solo-track":
        dispatch({ type: "set-track-solo", trackId, solo: target.checked });
        return;
      case "track-volume":
        dispatch({ type: "set-track-volume", trackId, volume: Number(target.value) / 100 });
    }
  }

  function render(state: PlaybackState): void {
    const view = presentPlayback(state);
    elements.playToggle.textContent = view.playLabel;
    elements.playToggle.disabled = view.playDisabled;
    elements.playStop.disabled = view.stopDisabled;
    elements.playCurrentTime.textContent = view.currentTime;
    elements.playDuration.textContent = view.duration;
    elements.playProgress.value = String(Math.round(view.progress * 1000));
    elements.playSpeed.value = String(view.speedPercent);
    elements.playSpeedValue.textContent = `${view.speedPercent}%`;
    elements.loopEnabled.checked = view.looping;
    elements.loopStart.value = rangeValueFromTick(
      state.loopDraft.start?.tick ?? 0,
      elements.loopStart,
      timeline,
    );
    elements.loopEnd.value = rangeValueFromTick(
      state.loopDraft.end?.tick ?? 0,
      elements.loopEnd,
      timeline,
    );
    elements.loopSnapMode.value = view.loopSnapMode;
    elements.soundFontRetry.hidden = !view.soundFontRetryVisible;
    elements.persistenceStatus.textContent = view.persistenceMessage;
    renderLoops(ownerDocument, elements.loopList, view.loops);
    renderTracks(ownerDocument, elements.trackList, view.tracks);
  }
}

function rangeValueFromTick(
  tick: number,
  input: HTMLInputElement,
  timeline: PlaybackTimelineMap,
): string {
  const maximum = Number(input.max) || 1000;
  const ratio = timeline.durationTicks > 0 ? tick / timeline.durationTicks : 0;
  return String(Math.round(Math.min(1, Math.max(0, ratio)) * maximum));
}

function positionFromRange(
  input: HTMLInputElement,
  timeline: PlaybackTimelineMap,
) {
  const maximum = Number(input.max) || 1000;
  const ratio = Math.min(1, Math.max(0, Number(input.value) / maximum));
  return musicalPositionFromTick(
    Math.round(timeline.durationTicks * ratio),
    timeline.durationMs * ratio,
    timeline,
  );
}

function renderLoops(
  ownerDocument: Document,
  host: HTMLElement,
  loops: ReturnType<typeof presentPlayback>["loops"],
): void {
  host.replaceChildren(...loops.map(loop => {
    const row = ownerDocument.createElement("div");
    row.className = "loop-row";

    const select = ownerDocument.createElement("button");
    select.type = "button";
    select.textContent = loop.selected ? "当前" : "选择";
    select.dataset.action = "select-loop";
    select.dataset.loopId = loop.id;

    const name = ownerDocument.createElement("input");
    name.value = loop.label;
    name.setAttribute("aria-label", "循环名称");
    name.dataset.action = "rename-loop";
    name.dataset.loopId = loop.id;

    const range = ownerDocument.createElement("span");
    range.textContent = loop.rangeLabel;

    const speed = ownerDocument.createElement("input");
    speed.type = "number";
    speed.min = "25";
    speed.max = "200";
    speed.step = "5";
    speed.value = loop.speedPercent === undefined ? "" : String(loop.speedPercent);
    speed.placeholder = "默认";
    speed.setAttribute("aria-label", "循环速度百分比");
    speed.dataset.action = "loop-speed";
    speed.dataset.loopId = loop.id;

    const remove = ownerDocument.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.dataset.action = "delete-loop";
    remove.dataset.loopId = loop.id;

    row.append(select, name, range, speed, remove);
    return row;
  }));
}

function renderTracks(
  ownerDocument: Document,
  host: HTMLElement,
  tracks: ReturnType<typeof presentPlayback>["tracks"],
): void {
  host.replaceChildren(...tracks.map(track => {
    const row = ownerDocument.createElement("div");
    row.className = "track-row";

    const title = ownerDocument.createElement("strong");
    title.textContent = track.name;

    const primary = checkbox(ownerDocument, "radio", "主", track.primary);
    primary.name = "primary-track";
    primary.dataset.action = "primary-track";
    primary.dataset.trackId = track.id;

    const additional = checkbox(ownerDocument, "checkbox", "显示", track.additional);
    additional.dataset.action = "additional-track";
    additional.dataset.trackId = track.id;

    const mute = checkbox(ownerDocument, "checkbox", "静音", track.muted);
    mute.dataset.action = "mute-track";
    mute.dataset.trackId = track.id;

    const solo = checkbox(ownerDocument, "checkbox", "独奏", track.solo);
    solo.dataset.action = "solo-track";
    solo.dataset.trackId = track.id;

    const volume = ownerDocument.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.value = String(track.volumePercent);
    volume.setAttribute("aria-label", `${track.name} 音量`);
    volume.dataset.action = "track-volume";
    volume.dataset.trackId = track.id;

    row.append(title, labelFor(ownerDocument, primary, "主"), labelFor(ownerDocument, additional, "显示"), labelFor(ownerDocument, mute, "静音"), labelFor(ownerDocument, solo, "独奏"), volume);
    return row;
  }));
}

function checkbox(
  ownerDocument: Document,
  type: "checkbox" | "radio",
  label: string,
  checked: boolean,
): HTMLInputElement {
  const input = ownerDocument.createElement("input");
  input.type = type;
  input.checked = checked;
  input.setAttribute("aria-label", label);
  return input;
}

function labelFor(
  ownerDocument: Document,
  input: HTMLInputElement,
  text: string,
): HTMLLabelElement {
  const label = ownerDocument.createElement("label");
  const caption = ownerDocument.createElement("span");
  caption.textContent = text;
  label.append(input, caption);
  return label;
}

function queryElements(ownerDocument: Document) {
  return {
    playToggle: required<HTMLButtonElement>(ownerDocument, "play-toggle"),
    playStop: required<HTMLButtonElement>(ownerDocument, "play-stop"),
    playCurrentTime: required<HTMLElement>(ownerDocument, "play-current-time"),
    playDuration: required<HTMLElement>(ownerDocument, "play-duration"),
    playProgress: required<HTMLInputElement>(ownerDocument, "play-progress"),
    playSpeed: required<HTMLInputElement>(ownerDocument, "play-speed"),
    playSpeedValue: required<HTMLOutputElement>(ownerDocument, "play-speed-value"),
    soundFontRetry: required<HTMLButtonElement>(ownerDocument, "soundfont-retry"),
    loopEnabled: required<HTMLInputElement>(ownerDocument, "loop-enabled"),
    loopSetA: required<HTMLButtonElement>(ownerDocument, "loop-set-a"),
    loopSetB: required<HTMLButtonElement>(ownerDocument, "loop-set-b"),
    loopSave: required<HTMLButtonElement>(ownerDocument, "loop-save"),
    loopSnapMode: required<HTMLSelectElement>(ownerDocument, "loop-snap-mode"),
    loopStart: required<HTMLInputElement>(ownerDocument, "loop-start"),
    loopEnd: required<HTMLInputElement>(ownerDocument, "loop-end"),
    loopList: required<HTMLElement>(ownerDocument, "loop-list"),
    trackList: required<HTMLElement>(ownerDocument, "track-list"),
    persistenceStatus: required<HTMLElement>(ownerDocument, "playback-persistence-status"),
  };
}

function required<T extends HTMLElement>(ownerDocument: Document, id: string): T {
  const element = ownerDocument.getElementById(id);
  if (!element) throw new Error(`Playback DOM is missing: ${id}`);
  return element as T;
}
