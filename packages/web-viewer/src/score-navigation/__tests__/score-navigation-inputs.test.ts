// @vitest-environment jsdom
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { attachScoreNavigationInputs } from "../score-navigation-inputs";

describe("attachScoreNavigationInputs", () => {
  it("turns one page for a wheel burst and supports PageUp/PageDown", () => {
    const element = document.createElement("div");
    document.body.append(element);
    let now = 1000;
    const movePage = vi.fn();
    const detach = attachScoreNavigationInputs(
      element,
      {
        mode: () => "page-turn",
        manualNavigation: vi.fn(),
        movePage,
      },
      () => now,
    );

    fireEvent.wheel(element, { deltaY: 40 });
    fireEvent.wheel(element, { deltaY: 60 });
    expect(movePage).toHaveBeenCalledTimes(1);
    expect(movePage).toHaveBeenLastCalledWith(1);

    now += 301;
    fireEvent.keyDown(document, { key: "PageUp" });
    expect(movePage).toHaveBeenLastCalledWith(-1);

    detach();
  });

  it("turns one page for a horizontal swipe but leaves pinch gestures alone", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const movePage = vi.fn();
    const detach = attachScoreNavigationInputs(element, {
      mode: () => "page-turn",
      manualNavigation: vi.fn(),
      movePage,
    });

    fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 40 }] });
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 100, clientY: 44 }] });
    expect(movePage).toHaveBeenCalledWith(1);

    fireEvent.touchStart(element, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
    });
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 20, clientY: 0 }] });
    expect(movePage).toHaveBeenCalledTimes(1);
    detach();
  });

  it("moves focus from a toolbar control to the score before handling PageDown", () => {
    const toolbarButton = document.createElement("button");
    const element = document.createElement("div");
    const scoreChild = document.createElement("div");
    element.tabIndex = -1;
    element.append(scoreChild);
    document.body.append(toolbarButton, element);
    toolbarButton.focus();
    const movePage = vi.fn();
    const detach = attachScoreNavigationInputs(element, {
      mode: () => "page-turn",
      manualNavigation: vi.fn(),
      movePage,
    });

    fireEvent.pointerDown(scoreChild);
    expect(document.activeElement).toBe(element);
    fireEvent.keyDown(document, { key: "PageDown" });
    expect(movePage).toHaveBeenCalledWith(1);

    detach();
  });
});
