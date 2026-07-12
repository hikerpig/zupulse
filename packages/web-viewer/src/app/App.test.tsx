// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ViewerApplication } from "./ViewerApplication";

afterEach(cleanup);

describe("App", () => {
  it("renders an accessible idle viewer and opens through the application service", async () => {
    const openScore = vi.fn(async () => undefined);
    const application = new ViewerApplication({ openScore, subscribe: () => () => undefined }, async () => ({
      togglePlayback: vi.fn(),
      pauseAndFlush: vi.fn(),
      destroy: vi.fn(),
    }));
    const user = userEvent.setup();

    render(<App application={application} />);
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("region", { name: "乐谱工作区" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "练习设置" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "练习设置" }));
    expect(screen.getByRole("complementary", { name: "练习设置" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭练习设置" }));
    expect(screen.queryByRole("complementary", { name: "练习设置" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "打开乐谱" }));
    expect(openScore).toHaveBeenCalledOnce();

    await application.destroy();
  });
});
