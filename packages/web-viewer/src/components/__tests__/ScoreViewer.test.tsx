// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreViewer } from "../ScoreViewer";

afterEach(() => cleanup());

describe("ScoreViewer", () => {
  it("expands a compact score preview and collapses it with Escape", async () => {
    const user = userEvent.setup();
    render(<ScoreViewer compact expandable />);

    const toggle = screen.getByRole("button", { name: "放大乐谱预览" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "收起乐谱预览" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "放大乐谱预览" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the alphaTab host contract without showing expansion controls in Viewer", () => {
    const view = render(<ScoreViewer />);
    expect(view.container.querySelector("#alpha-tab")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /乐谱预览/ })).toBeNull();
  });
});
