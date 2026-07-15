// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
