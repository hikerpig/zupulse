import { describe, expect, it } from "vitest";
import {
  attachAlphaTabNavigationEvents,
  attachAlphaTabGestureSelection,
  attachAlphaTabPositionEvents,
  createAlphaTabApi,
  loadAlphaTabBytes,
} from "../alphaTabBrowser";
import type { AlphaTabApiLike } from "../alphaTabBrowser";

describe("createAlphaTabApi", () => {
  it("uses an injectable factory so tests do not require a browser DOM", () => {
    const element = {} as HTMLElement;
    const api = { play: () => true };

    const created = createAlphaTabApi(element, { display: { scale: 1.2 } }, (actualElement, options) => {
      expect(actualElement).toBe(element);
      expect(options).toEqual({ display: { scale: 1.2 } });
      return api;
    });

    expect(created).toBe(api);
  });
});

describe("attachAlphaTabPositionEvents", () => {
  it("maps alphaTab playerPositionChanged events to stable app events", () => {
    let handler: ((arg: unknown) => void) | undefined;
    let detached = false;
    const api: AlphaTabApiLike = {
      playerPositionChanged: {
        on(nextHandler: (arg: unknown) => void) {
          handler = nextHandler;
          return () => {
            detached = true;
          };
        },
      },
    };
    const events: unknown[] = [];

    const detach = attachAlphaTabPositionEvents(api, (event) => events.push(event));
    handler?.({ currentTime: 1250, endTime: 5000, tickPosition: 240 });
    detach();

    expect(events).toEqual([
      {
        positionMs: 1250,
        endMs: 5000,
        tickPosition: 240,
      },
    ]);
    expect(detached).toBe(true);
  });
});

describe("attachAlphaTabNavigationEvents", () => {
  it("exposes completed renders and public cursor bounds through a custom scroll handler", () => {
    let rendered: (() => void) | undefined;
    let renderDetached = false;
    const systems: unknown[] = [];
    const api = {
      postRenderFinished: {
        on(handler: () => void) {
          rendered = handler;
          return () => {
            renderDetached = true;
          };
        },
      },
    };

    const detach = attachAlphaTabNavigationEvents(api, {
      renderFinished: () => systems.push("rendered"),
      cursorSystemChanged: (system) => systems.push(system),
    });
    rendered?.();
    api.customScrollHandler?.forceScrollTo({
      barBounds: {
        masterBarBounds: {
          index: 3,
          staffSystemBounds: {
            index: 2,
            realBounds: { x: 0, y: 240, w: 800, h: 180 },
            bars: [],
          },
        },
      },
    });

    expect(systems).toEqual([
      "rendered",
      {
        systemIndex: 2,
        firstMeasureIndex: 3,
        bounds: { x: 0, y: 240, width: 800, height: 180 },
      },
    ]);

    detach();
    expect(renderDetached).toBe(true);
    expect(api.customScrollHandler).toBeUndefined();
  });
});

describe("loadAlphaTabBytes", () => {
  it("delegates bytes to AlphaTabApi.load", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const api = {
      load(scoreData: unknown) {
        expect(scoreData).toBe(bytes);
        return true;
      },
    };

    expect(loadAlphaTabBytes(api, bytes)).toBe(true);
  });

  it("returns false when load is unavailable", () => {
    expect(loadAlphaTabBytes({}, new Uint8Array([1]))).toBe(false);
  });
});

describe("attachAlphaTabGestureSelection", () => {
  it("commits a one-finger tap but suppresses scroll and pinch selections", () => {
    let beatHandler: ((beat: TestBeat) => void) | undefined;
    let noteHandler: ((note: { beat: TestBeat }) => void) | undefined;
    let beatDetached = false;
    let noteDetached = false;
    let now = 1000;
    const target = new EventTarget();
    const selected: unknown[] = [];
    const api = {
      beatMouseDown: {
        on(handler: (beat: TestBeat) => void) {
          beatHandler = handler;
          return () => {
            beatDetached = true;
          };
        },
      },
      noteMouseDown: {
        on(handler: (note: { beat: TestBeat }) => void) {
          noteHandler = handler;
          return () => {
            noteDetached = true;
          };
        },
      },
    };
    const detach = attachAlphaTabGestureSelection(
      api,
      target,
      (moment) => selected.push(moment),
      () => now,
    );

    dispatchTouch(target, "touchstart", [touch(10, 10)]);
    beatHandler?.(beat(1, 240));
    expect(selected).toEqual([]);
    dispatchTouch(target, "touchend", []);
    expect(selected).toEqual([{ measureIndex: 1, offsetTicks: 240 }]);

    dispatchTouch(target, "touchstart", [touch(10, 10)]);
    beatHandler?.(beat(2, 0));
    dispatchTouch(target, "touchmove", [touch(10, 30)]);
    dispatchTouch(target, "touchend", []);
    expect(selected).toHaveLength(1);

    dispatchTouch(target, "touchstart", [touch(0, 0), touch(0, 100)]);
    noteHandler?.({ beat: beat(3, 480) });
    dispatchTouch(target, "touchend", []);
    expect(selected).toHaveLength(1);

    beatHandler?.(beat(4, 0));
    expect(selected).toHaveLength(1);
    now += 501;
    beatHandler?.(beat(4, 0));
    expect(selected.at(-1)).toEqual({ measureIndex: 4, offsetTicks: 0 });

    detach();
    expect(beatDetached).toBe(true);
    expect(noteDetached).toBe(true);
  });
});

type TestBeat = {
  displayStart: number;
  voice: { bar: { index: number } };
};

function beat(measureIndex: number, displayStart: number): TestBeat {
  return { displayStart, voice: { bar: { index: measureIndex } } };
}

function touch(clientX: number, clientY: number) {
  return { clientX, clientY };
}

function dispatchTouch(target: EventTarget, type: string, touches: Array<{ clientX: number; clientY: number }>) {
  const event = new Event(type);
  Object.defineProperty(event, "touches", { value: touches });
  target.dispatchEvent(event);
}
