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
  tracks: AlphaTabBrowserTrackLike[];
  masterBars: Array<{
    index: number;
    start: number;
    timeSignatureNumerator?: number;
    calculateDuration(respectAnacrusis?: boolean): number;
  }>;
};

export type AlphaTabApiLike = {
  play?: () => unknown;
  destroy?: () => void;
  load?: (scoreData: unknown, trackIndexes?: number[]) => boolean;
  score?: AlphaTabBrowserScoreLike | null;
  scoreLoaded?: AlphaTabEvent<AlphaTabBrowserScoreLike>;
  settings?: {
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
  soundFontLoaded?: AlphaTabVoidEvent;
  soundFontLoad?: AlphaTabEvent<{ loaded?: number; total?: number }>;
  error?: AlphaTabEvent<unknown>;
  loadSoundFontFromUrl?: (url: string, append: boolean) => void;
};

export type AlphaTabApiFactory = (element: HTMLElement, options: unknown) => AlphaTabApiLike;

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
  const detach = api.playerPositionChanged?.on(arg => {
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

function defaultAlphaTabApiFactory(element: HTMLElement, options: unknown): AlphaTabApiLike {
  return new alphaTab.AlphaTabApi(element, options as alphaTab.Settings) as unknown as AlphaTabApiLike;
}
