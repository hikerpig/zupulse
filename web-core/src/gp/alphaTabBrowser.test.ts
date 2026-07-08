import { describe, expect, it } from "vitest";
import { attachAlphaTabPositionEvents, createAlphaTabApi } from "./alphaTabBrowser";

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
    const api = {
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

    const detach = attachAlphaTabPositionEvents(api, event => events.push(event));
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
