// @vitest-environment jsdom

import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PianoKeyVisualizationResizeHandle } from "../PianoKeyVisualizationResizeHandle";

describe("PianoKeyVisualizationResizeHandle", () => {
  it("supports accessible keyboard resizing and reset", () => {
    const onHeightChange = vi.fn();
    render(
      <PianoKeyVisualizationResizeHandle
        containerRef={createRef()}
        height={260}
        label="调整钢琴按键提示高度"
        onHeightChange={onHeightChange}
      />,
    );
    const separator = screen.getByRole("separator", { name: "调整钢琴按键提示高度" });

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    fireEvent.keyDown(separator, { key: "ArrowDown" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });
    fireEvent.doubleClick(separator);

    expect(onHeightChange.mock.calls.map(([height]) => height)).toEqual([276, 244, 180, 420, 260]);
    expect(separator.getAttribute("aria-valuenow")).toBe("260");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("drags upward to grow and restores text selection when dragging ends", () => {
    const containerRef = createRef<HTMLElement>();
    const onHeightChange = vi.fn();
    const view = render(
      <section ref={containerRef}>
        <PianoKeyVisualizationResizeHandle
          containerRef={containerRef}
          height={260}
          label="调整钢琴按键提示高度"
          onHeightChange={onHeightChange}
        />
      </section>,
    );
    vi.spyOn(containerRef.current!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 800,
      top: 0,
      right: 800,
      bottom: 700,
      height: 700,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const separator = within(view.container).getByRole("separator");
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });

    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(down, {
      pointerId: { value: 1 },
      clientY: { value: 300 },
    });
    fireEvent(separator, down);
    const move = new Event("pointermove", { bubbles: true });
    Object.defineProperty(move, "clientY", { value: 200 });
    fireEvent(separator, move);
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(onHeightChange).toHaveBeenCalledWith(360);
    expect(document.body.style.userSelect).toBe("");
  });
});
