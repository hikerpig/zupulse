// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { PianoKeyHintEvent } from "@zupulse/web-core";
import type { PianoKeyActive, PianoKeyFrame } from "../../model/piano-key-projection";
import { createKeyboardGeometry, createPianoKeySvgRenderer } from "../PianoKeyVisualization";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

describe("createPianoKeySvgRenderer", () => {
  it("reuses hint nodes and only changes the keys whose active state changed", () => {
    const events: PianoKeyHintEvent[] = [
      { pitch: 60, startTick: 0, endTick: 960, hand: "left" },
      { pitch: 64, startTick: 480, endTick: 1440, hand: "right" },
    ];
    const hintLayer = document.createElementNS(SVG_NAMESPACE, "g");
    const keyLayer = document.createElementNS(SVG_NAMESPACE, "g");
    for (const pitch of [60, 64]) {
      const key = document.createElementNS(SVG_NAMESPACE, "rect");
      key.setAttribute("data-key-pitch", String(pitch));
      keyLayer.append(key);
    }
    const renderer = createPianoKeySvgRenderer(hintLayer, keyLayer, createKeyboardGeometry(events));

    renderer.render(frame([{ pitch: 60, hand: "left" }], events));
    const firstHint = hintLayer.children[0];
    const pooledHint = hintLayer.children[1];
    expect(firstHint).toBeTruthy();
    expect(pooledHint).toBeTruthy();
    expect(keyLayer.querySelector('[data-key-pitch="60"]')?.getAttribute("data-active-hand")).toBe("left");

    renderer.render(frame([{ pitch: 64, hand: "right" }], [events[1]!]));

    expect(hintLayer.children[0]).toBe(firstHint);
    expect(hintLayer.children[1]).toBe(pooledHint);
    expect((pooledHint as SVGRectElement).style.display).toBe("none");
    expect(keyLayer.querySelector('[data-key-pitch="60"]')?.hasAttribute("data-active")).toBe(false);
    expect(keyLayer.querySelector('[data-key-pitch="60"]')?.hasAttribute("data-active-hand")).toBe(false);
    expect(keyLayer.querySelector('[data-key-pitch="64"]')?.getAttribute("data-active-hand")).toBe("right");
  });

  it("marks hints that reached the strike line as sounding and clears the mark afterwards", () => {
    const events: PianoKeyHintEvent[] = [{ pitch: 60, startTick: 0, endTick: 960, hand: "right" }];
    const hintLayer = document.createElementNS(SVG_NAMESPACE, "g");
    const keyLayer = document.createElementNS(SVG_NAMESPACE, "g");
    const key = document.createElementNS(SVG_NAMESPACE, "rect");
    key.setAttribute("data-key-pitch", "60");
    keyLayer.append(key);
    const renderer = createPianoKeySvgRenderer(hintLayer, keyLayer, createKeyboardGeometry(events));

    renderer.render({
      currentTick: 0,
      activeKeys: [],
      hints: [{ ...events[0]!, startRatio: 0.25, endRatio: 0.5 }],
    });
    const hint = hintLayer.children[0]!;
    expect(hint.hasAttribute("data-sounding")).toBe(false);

    renderer.render({
      currentTick: 0,
      activeKeys: [{ pitch: 60, hand: "right" }],
      hints: [{ ...events[0]!, startRatio: 0, endRatio: 0.25 }],
    });
    expect(hintLayer.children[0]).toBe(hint);
    expect(hint.hasAttribute("data-sounding")).toBe(true);

    renderer.render({
      currentTick: 0,
      activeKeys: [],
      hints: [{ ...events[0]!, startRatio: 0.1, endRatio: 0.35 }],
    });
    expect(hint.hasAttribute("data-sounding")).toBe(false);
  });

  it("removes pooled hints and active key state when an effect instance is destroyed", () => {
    const events: PianoKeyHintEvent[] = [{ pitch: 60, startTick: 0, endTick: 960, hand: "left" }];
    const hintLayer = document.createElementNS(SVG_NAMESPACE, "g");
    const keyLayer = document.createElementNS(SVG_NAMESPACE, "g");
    const key = document.createElementNS(SVG_NAMESPACE, "rect");
    key.setAttribute("data-key-pitch", "60");
    keyLayer.append(key);
    const renderer = createPianoKeySvgRenderer(hintLayer, keyLayer, createKeyboardGeometry(events));
    renderer.render(frame([{ pitch: 60, hand: "left" }], events));

    renderer.destroy();

    expect(hintLayer.childElementCount).toBe(0);
    expect(key.hasAttribute("data-active")).toBe(false);
    expect(key.hasAttribute("data-active-hand")).toBe(false);
  });
});

function frame(activeKeys: PianoKeyActive[], events: readonly PianoKeyHintEvent[]): PianoKeyFrame {
  return {
    currentTick: 0,
    activeKeys,
    hints: events.map((event) => ({ ...event, startRatio: 0.25, endRatio: 0.5 })),
  };
}
