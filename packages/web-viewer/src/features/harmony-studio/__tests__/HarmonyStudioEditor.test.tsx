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
    expect(screen.getByRole("button", { name: /^C ·/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "标记为 N.C." })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    screen.getByRole("button", { name: /^C ·/ }).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("applies constrained root, kind, extension, degrees, and bass fields", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <HarmonyStudioEditor candidates={[]} onSelect={vi.fn()} onApply={onApply} onNoChord={vi.fn()} />,
    );
    const editor = within(view.container);

    await user.selectOptions(editor.getByRole("combobox", { name: "根音" }), "D");
    await user.selectOptions(editor.getByRole("combobox", { name: "和弦类型" }), "dominant");
    await user.selectOptions(editor.getByRole("combobox", { name: "扩展音" }), "9");
    await user.selectOptions(editor.getByRole("combobox", { name: "度数操作" }), "alter");
    await user.selectOptions(editor.getByRole("combobox", { name: "度数" }), "5");
    await user.selectOptions(editor.getByRole("combobox", { name: "度数变化" }), "1");
    await user.click(editor.getByRole("button", { name: "添加度数" }));
    await user.selectOptions(editor.getByRole("combobox", { name: "低音" }), "F");
    await user.click(editor.getByRole("button", { name: "应用结构化和弦" }));

    expect(onApply).toHaveBeenCalledWith({
      root: { step: "D", alter: 0 },
      kind: "dominant",
      extension: 9,
      degrees: [{ operation: "alter", value: 5, alter: 1 }],
      bass: { step: "F", alter: 0 },
    });
  });
});
