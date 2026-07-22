// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HarmonyStudioEditor } from "../HarmonyStudioEditor";

describe("HarmonyStudioEditor", () => {
  it("offers structured candidates and N.C. without a free-form chord input", () => {
    const onSelect = vi.fn();
    render(
      <HarmonyStudioEditor
        candidates={[
          {
            chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
            localScore: 1,
            sequenceScore: 1,
            confidence: 0.9,
          },
        ]}
        onSelect={onSelect}
        onApply={vi.fn()}
        onNoChord={vi.fn()}
        unresolvedReason="证据不足"
      />,
    );
    expect(screen.getByRole("button", { name: /^首选 C ·/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "标记为 N.C." })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    screen.getByRole("button", { name: /^首选 C ·/ }).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("labels the preferred candidate and keeps zero-confidence alternatives available", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <HarmonyStudioEditor
        candidates={[
          {
            chord: { root: { step: "A", alter: 0 }, kind: "major", degrees: [] },
            localScore: 1,
            sequenceScore: 1,
            confidence: 1,
          },
          {
            chord: { root: { step: "B", alter: 0 }, kind: "dominant", extension: 7, degrees: [] },
            localScore: 0,
            sequenceScore: 0,
            confidence: 0,
          },
        ]}
        onSelect={onSelect}
        onApply={vi.fn()}
        onNoChord={vi.fn()}
      />,
    );

    const preferred = screen.getByRole("button", { name: "首选 A · 100%" });
    const alternative = screen.getByRole("button", { name: "低置信度 B7 · 0%" });
    expect(preferred.getAttribute("data-priority")).toBe("preferred");
    expect(alternative.getAttribute("data-priority")).toBe("low");
    await user.click(alternative);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ confidence: 0 }));
  });

  it("shows a stable empty-candidate message", () => {
    const view = render(
      <HarmonyStudioEditor candidates={[]} onSelect={vi.fn()} onApply={vi.fn()} onNoChord={vi.fn()} />,
    );
    const editor = within(view.container);

    expect(editor.getByText("当前片段没有高置信度候选，可手动构建。")).toBeTruthy();
    expect(editor.queryByRole("list", { name: "结构化和弦候选" })).toBeNull();
  });

  it("applies constrained root, kind, extension, degrees, and bass fields", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <HarmonyStudioEditor candidates={[]} onSelect={vi.fn()} onApply={onApply} onNoChord={vi.fn()} />,
    );
    const editor = within(view.container);

    await user.click(editor.getByRole("button", { name: "手动构建" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "根音" }), "D");
    await user.selectOptions(screen.getByRole("combobox", { name: "和弦类型" }), "dominant");
    await user.selectOptions(screen.getByRole("combobox", { name: "扩展音" }), "9");
    await user.selectOptions(screen.getByRole("combobox", { name: "度数操作" }), "alter");
    await user.selectOptions(screen.getByRole("combobox", { name: "度数" }), "5");
    await user.selectOptions(screen.getByRole("combobox", { name: "度数变化" }), "1");
    await user.click(screen.getByRole("button", { name: "添加度数" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "低音" }), "F");
    await user.click(screen.getByRole("button", { name: "应用结构化和弦" }));

    expect(onApply).toHaveBeenCalledWith({
      root: { step: "D", alter: 0 },
      kind: "dominant",
      extension: 9,
      degrees: [{ operation: "alter", value: 5, alter: 1 }],
      bass: { step: "F", alter: 0 },
    });
  });
});
