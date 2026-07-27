// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HarmonyRangeViewItem } from "../harmony-range-view-model";
import { HarmonyRangeWorkspace } from "../harmony-range-workspace";

const ranges: HarmonyRangeViewItem[] = [
  {
    key: "0:0-0:4",
    origin: "analysis",
    effective: {
      type: "unresolved",
      origin: "analysis",
      reason: "low-confidence",
      alternatives: [],
      range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
    },
  },
  {
    key: "1:0-1:4",
    origin: "correction",
    effective: {
      type: "no-chord",
      origin: "correction",
      range: { start: { measureIndex: 1, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 4 } },
    },
  },
];

describe("HarmonyRangeWorkspace", () => {
  it("keeps a filtered selection visible and completes the list-editor keyboard loop", () => {
    const onSelect = vi.fn();
    render(
      <HarmonyRangeWorkspace ranges={ranges} selectedKey={ranges[0]!.key} onSelect={onSelect} editor={<input />} />,
    );
    const list = screen.getByRole("list", { name: "分析片段" });
    const first = within(list).getByRole("button", { name: "片段 1，算法结果" });
    expect(within(first).getByTitle("算法结果").dataset.origin).toBe("analysis");
    expect(within(list).getByTitle("用户修正").dataset.origin).toBe("correction");

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(ranges[1]);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "和弦编辑器" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(first);

    fireEvent.click(screen.getByRole("button", { name: "已修正" }));
    expect(screen.getByRole("status", { name: "筛选选择说明" })).toBeTruthy();
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });
});
