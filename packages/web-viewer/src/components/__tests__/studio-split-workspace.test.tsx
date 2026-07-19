// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioSplitWorkspace } from "../studio-split-workspace";

describe("StudioSplitWorkspace", () => {
  it("supports keyboard bounds and double-click reset", () => {
    const onSplitChange = vi.fn();
    render(
      <StudioSplitWorkspace split={60} onSplitChange={onSplitChange} score={<p>乐谱</p>} analysis={<p>分析</p>} />,
    );
    const separator = screen.getByRole("separator", { name: "调整乐谱与分析面板宽度" });

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });
    fireEvent.doubleClick(separator);

    expect(onSplitChange.mock.calls.map(([value]) => value)).toEqual([55, 65, 40, 75, 40]);
    expect(separator.getAttribute("aria-valuenow")).toBe("60");
  });

  it("clamps pointer dragging and restores text selection when dragging ends", () => {
    const onSplitChange = vi.fn();
    const view = render(
      <StudioSplitWorkspace split={60} onSplitChange={onSplitChange} score={<p>乐谱</p>} analysis={<p>分析</p>} />,
    );
    const workspace = view.container.firstElementChild as HTMLElement;
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 1000,
      top: 0,
      right: 1100,
      bottom: 500,
      height: 500,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    const separator = within(view.container).getByRole("separator");
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    expect(document.body.style.userSelect).toBe("none");
    for (const clientX of [0, 2000]) {
      const move = new Event("pointermove", { bubbles: true });
      Object.defineProperty(move, "clientX", { value: clientX });
      fireEvent(separator, move);
    }
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(onSplitChange.mock.calls.map(([value]) => value)).toEqual([40, 75]);
    expect(document.body.style.userSelect).toBe("");
  });
});
