import * as alphaTab from "@coderline/alphatab";

export type AlphaTabPositionEvent = {
  positionMs: number;
  endMs?: number;
  tickPosition?: number;
};

export type AlphaTabApiLike = {
  play?: () => unknown;
  destroy?: () => void;
  load?: (scoreData: unknown, trackIndexes?: number[]) => boolean;
  playerPositionChanged?: {
    on(handler: (arg: unknown) => void): () => void;
  };
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
  return new alphaTab.AlphaTabApi(element, options as alphaTab.Settings);
}
