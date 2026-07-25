import * as alphaTab from "@coderline/alphatab";

export type AlphaTabPositionEvent = {
  positionMs: number;
  endMs?: number;
  tickPosition?: number;
};

export type AlphaTabEvent<T> = {
  on(handler: (arg: T) => void): () => void;
};

export type AlphaTabVoidEvent = {
  on(handler: () => void): () => void;
};

export type AlphaTabBrowserTrackLike = {
  index: number;
  name?: string;
};

export type AlphaTabBrowserScoreLike = {
  tempo?: number;
  tracks: AlphaTabBrowserTrackLike[];
  masterBars: Array<{
    index: number;
    start: number;
    timeSignatureNumerator?: number;
    calculateDuration(respectAnacrusis?: boolean): number;
  }>;
};

export type AlphaTabBoundsLike = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AlphaTabStaffSystemBoundsLike = {
  index: number;
  realBounds: AlphaTabBoundsLike;
  bars: Array<{ index: number }>;
};

export type AlphaTabBeatBoundsLike = {
  barBounds: {
    masterBarBounds: {
      index: number;
      staffSystemBounds: AlphaTabStaffSystemBoundsLike | null;
    };
  };
};

export type AlphaTabScrollHandlerLike = {
  forceScrollTo(currentBeatBounds: AlphaTabBeatBoundsLike): void;
  onBeatCursorUpdating?(
    startBeat: AlphaTabBeatBoundsLike,
    endBeat: AlphaTabBeatBoundsLike | undefined,
    cursorMode: unknown,
    actualBeatCursorStartX: number,
    actualBeatCursorEndX: number,
    actualBeatCursorTransitionDuration: number,
  ): void;
};

export type AlphaTabApiLike = {
  play?: () => unknown;
  destroy?: () => void;
  load?: (scoreData: unknown, trackIndexes?: number[]) => boolean;
  score?: AlphaTabBrowserScoreLike | null;
  scoreLoaded?: AlphaTabEvent<AlphaTabBrowserScoreLike>;
  settings?: {
    display?: {
      scale?: number;
    };
    importer?: {
      encoding?: string;
    };
  };
  updateSettings?: () => void;
  playPause?: () => void;
  stop?: () => void;
  tickPosition?: number;
  timePosition?: number;
  endTick?: number;
  endTime?: number;
  playbackSpeed?: number;
  playbackRange?: { startTick: number; endTick: number } | null;
  isLooping?: boolean;
  renderTracks?: (tracks: AlphaTabBrowserTrackLike[]) => void;
  changeTrackMute?: (tracks: AlphaTabBrowserTrackLike[], muted: boolean) => void;
  changeTrackSolo?: (tracks: AlphaTabBrowserTrackLike[], solo: boolean) => void;
  changeTrackVolume?: (tracks: AlphaTabBrowserTrackLike[], volume: number) => void;
  playerReady?: AlphaTabVoidEvent;
  playerStateChanged?: AlphaTabEvent<unknown>;
  playerPositionChanged?: AlphaTabEvent<unknown>;
  postRenderFinished?: AlphaTabVoidEvent;
  boundsLookup?: {
    staffSystems: AlphaTabStaffSystemBoundsLike[];
  } | null;
  customScrollHandler?: AlphaTabScrollHandlerLike;
  tickCache?: {
    masterBars: Array<{
      start: number;
      end: number;
      masterBar: { index: number };
    }>;
  } | null;
  soundFontLoaded?: AlphaTabVoidEvent;
  soundFontLoad?: AlphaTabEvent<{ loaded?: number; total?: number }>;
  beatMouseDown?: AlphaTabEvent<AlphaTabSelectionBeat>;
  noteMouseDown?: AlphaTabEvent<{ beat: AlphaTabSelectionBeat }>;
  error?: AlphaTabEvent<unknown>;
  loadSoundFontFromUrl?: (url: string, append: boolean) => void;
};

export type AlphaTabCursorSystem = {
  systemIndex: number;
  firstMeasureIndex: number;
  bounds: { x: number; y: number; width: number; height: number };
};

export type AlphaTabApiFactory = (element: HTMLElement, options: unknown) => AlphaTabApiLike;

type AlphaTabSelectionBeat = {
  displayStart: number;
  voice: { bar: { index: number } };
};

type AlphaTabSelectionApiLike = {
  beatMouseDown?: AlphaTabEvent<AlphaTabSelectionBeat>;
  noteMouseDown?: AlphaTabEvent<{ beat: AlphaTabSelectionBeat }>;
};

export type AlphaTabWrittenSelection = {
  measureIndex: number;
  offsetTicks: number;
};

export function createAlphaTabApi(
  element: HTMLElement,
  options: unknown = {},
  factory: AlphaTabApiFactory = defaultAlphaTabApiFactory,
): AlphaTabApiLike {
  return factory(element, options);
}

export function loadAlphaTabBytes(api: AlphaTabApiLike, bytes: Uint8Array): boolean {
  return api.load?.(bytes) ?? false;
}

export function attachAlphaTabPositionEvents(
  api: AlphaTabApiLike,
  emit: (event: AlphaTabPositionEvent) => void,
): () => void {
  const detach = api.playerPositionChanged?.on((arg) => {
    const event = arg as { currentTime?: number; endTime?: number; tickPosition?: number };
    const mapped: AlphaTabPositionEvent = {
      positionMs: event.currentTime ?? 0,
    };
    if (event.endTime !== undefined) {
      mapped.endMs = event.endTime;
    }
    if (event.tickPosition !== undefined) {
      mapped.tickPosition = event.tickPosition;
    }
    emit(mapped);
  });

  return detach ?? (() => {});
}

export function attachAlphaTabNavigationEvents(
  api: AlphaTabApiLike,
  listeners: {
    renderFinished(): void;
    cursorSystemChanged(system: AlphaTabCursorSystem): void;
  },
): () => void {
  const detachRender = api.postRenderFinished?.on(listeners.renderFinished) ?? (() => {});
  const handler: AlphaTabScrollHandlerLike = {
    forceScrollTo: (beat) => emitCursorSystem(beat),
    onBeatCursorUpdating: (beat) => emitCursorSystem(beat),
  };
  const emitCursorSystem = (beat: AlphaTabBeatBoundsLike) => {
    const masterBar = beat.barBounds.masterBarBounds;
    const system = masterBar.staffSystemBounds;
    if (!system || !isFiniteBounds(system.realBounds)) return;
    listeners.cursorSystemChanged({
      systemIndex: system.index,
      firstMeasureIndex: system.bars[0]?.index ?? masterBar.index,
      bounds: {
        x: system.realBounds.x,
        y: system.realBounds.y,
        width: system.realBounds.w,
        height: system.realBounds.h,
      },
    });
  };
  api.customScrollHandler = handler;

  return () => {
    detachRender();
    if (api.customScrollHandler === handler) delete api.customScrollHandler;
  };
}

export function attachAlphaTabGestureSelection(
  api: AlphaTabSelectionApiLike,
  eventTarget: EventTarget,
  select: (selection: AlphaTabWrittenSelection) => void,
  now: () => number = Date.now,
): () => void {
  let active = false;
  let blocked = false;
  let startX = 0;
  let startY = 0;
  let pending: AlphaTabWrittenSelection | undefined;
  let suppressUntil = 0;

  const onTouchStart = (event: Event) => {
    const touches = touchPoints(event);
    active = true;
    blocked = touches.length !== 1;
    pending = undefined;
    startX = touches[0]?.clientX ?? 0;
    startY = touches[0]?.clientY ?? 0;
  };
  const onTouchMove = (event: Event) => {
    const touches = touchPoints(event);
    if (touches.length !== 1) {
      blocked = true;
      return;
    }
    const point = touches[0]!;
    if (Math.hypot(point.clientX - startX, point.clientY - startY) > 8) blocked = true;
  };
  const onTouchEnd = () => {
    active = false;
    if (blocked) {
      pending = undefined;
      suppressUntil = now() + 500;
      return;
    }
    if (pending) select(pending);
    pending = undefined;
  };
  const handleSelection = (beat: AlphaTabSelectionBeat) => {
    const selection = { measureIndex: beat.voice.bar.index, offsetTicks: beat.displayStart };
    if (active) {
      pending = selection;
      return;
    }
    if (now() >= suppressUntil) select(selection);
  };

  eventTarget.addEventListener("touchstart", onTouchStart);
  eventTarget.addEventListener("touchmove", onTouchMove);
  eventTarget.addEventListener("touchend", onTouchEnd);
  eventTarget.addEventListener("touchcancel", onTouchEnd);
  const detachBeat = api.beatMouseDown?.on(handleSelection) ?? (() => {});
  const detachNote = api.noteMouseDown?.on((note) => handleSelection(note.beat)) ?? (() => {});

  return () => {
    eventTarget.removeEventListener("touchstart", onTouchStart);
    eventTarget.removeEventListener("touchmove", onTouchMove);
    eventTarget.removeEventListener("touchend", onTouchEnd);
    eventTarget.removeEventListener("touchcancel", onTouchEnd);
    detachBeat();
    detachNote();
  };
}

function touchPoints(event: Event): ArrayLike<{ clientX: number; clientY: number }> {
  return (event as Event & { touches?: ArrayLike<{ clientX: number; clientY: number }> }).touches ?? [];
}

function isFiniteBounds(bounds: AlphaTabBoundsLike): boolean {
  return [bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite);
}

function defaultAlphaTabApiFactory(element: HTMLElement, options: unknown): AlphaTabApiLike {
  return new alphaTab.AlphaTabApi(element, options as alphaTab.Settings) as unknown as AlphaTabApiLike;
}
