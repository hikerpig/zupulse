// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { AppStoreProvider } from "../../app/appStore";
import { ScoreViewer } from "../ScoreViewer";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ScoreViewer", () => {
  it("expands a compact score preview and collapses it with Escape", async () => {
    const user = userEvent.setup();
    renderScoreViewer(<ScoreViewer compact expandable />);

    const toggle = screen.getByRole("button", { name: "放大乐谱预览" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "收起乐谱预览" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "放大乐谱预览" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the alphaTab host contract without showing expansion controls in Viewer", () => {
    const view = renderScoreViewer(<ScoreViewer />);
    expect(view.container.querySelector("#alpha-tab")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /乐谱预览/ })).toBeNull();
  });

  it("uses bounded buttons and emits one alphaTab commit per action", async () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    renderScoreViewer(<ScoreViewer />);

    expect(screen.getByText("100%")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "放大谱面" }));

    expect(screen.getByText("110%")).toBeTruthy();
    expect(commits).toHaveBeenCalledTimes(1);
    expect((commits.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ zoom: 1.1 });
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("previews pinch without React commits and commits once when the gesture ends", () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    const view = renderScoreViewer(<ScoreViewer />);
    const stage = screen.getByRole("region", { name: "乐谱工作区" });
    const viewer = view.container.querySelector("#alpha-tab") as HTMLElement;

    fireEvent.touchStart(stage, { touches: [touch(0, 0), touch(0, 100)] });
    fireEvent.touchMove(stage, { touches: [touch(0, 0), touch(0, 140)] });

    expect(viewer.style.transform).toBe("scale(1.4)");
    expect(commits).not.toHaveBeenCalled();
    fireEvent.touchEnd(stage, { touches: [] });

    expect(commits).toHaveBeenCalledTimes(1);
    expect((commits.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ zoom: 1.4 });
    expect(viewer.style.transform).toBe("");
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("leaves one-finger score scrolling to the scroll host without creating a zoom commit", () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    const view = renderScoreViewer(<ScoreViewer />);
    const stage = screen.getByRole("region", { name: "乐谱工作区" });
    const viewer = view.container.querySelector("#alpha-tab") as HTMLElement;

    fireEvent.touchStart(stage, { touches: [touch(0, 100)] });
    fireEvent.touchMove(stage, { touches: [touch(0, 40)] });
    fireEvent.touchEnd(stage, { touches: [] });

    expect(viewer.style.transform).toBe("");
    expect(commits).not.toHaveBeenCalled();
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });
});

function renderScoreViewer(viewer: ReactElement) {
  return render(<AppStoreProvider>{viewer}</AppStoreProvider>);
}

function touch(clientX: number, clientY: number) {
  return { clientX, clientY, identifier: clientY, target: document.body };
}
