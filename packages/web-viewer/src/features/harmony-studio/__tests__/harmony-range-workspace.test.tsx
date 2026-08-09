// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(cleanup);

describe("HarmonyRangeWorkspace", () => {
  it("starts with unresolved ranges when the document needs confirmation", () => {
    render(
      <HarmonyRangeWorkspace ranges={ranges} selectedKey={ranges[0]!.key} onSelect={vi.fn()} editor={<input />} />,
    );

    expect(screen.getByRole("button", { name: "待确认" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "待确认" }).textContent).toContain("1");
    expect(screen.queryByRole("status", { name: "分析进度统计" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "分析片段" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("SEGMENTS")).toBeNull();
  });

  it("starts with all ranges when no confirmation is needed", () => {
    render(<HarmonyRangeWorkspace ranges={[ranges[1]!]} onSelect={vi.fn()} editor={<input />} />);

    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("list", { name: "分析片段" })).getAllByRole("button")).toHaveLength(1);
  });

  it("keeps a filtered selection visible and completes the list-editor keyboard loop", () => {
    const onSelect = vi.fn();
    render(
      <HarmonyRangeWorkspace ranges={ranges} selectedKey={ranges[0]!.key} onSelect={onSelect} editor={<input />} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "全部" }));
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
    expect(screen.getByRole("status", { name: "筛选选择说明" }).textContent).toContain("当前片段");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });
});
