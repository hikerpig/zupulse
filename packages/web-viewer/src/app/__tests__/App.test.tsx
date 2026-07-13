// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ViewerApplication } from "../ViewerApplication";
import type { SheetLibraryRepository } from "@zupulse/web-core";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("App", () => {
  it("renders a compact workbench shell instead of detached cards", async () => {
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );

    render(<App application={application} />);

    expect(screen.getByRole("main").classList.contains("app-shell")).toBe(true);
    expect(screen.getByRole("banner").classList.contains("context-bar")).toBe(true);
    expect(screen.getByRole("region", { name: "乐谱工作区" }).classList.contains("score-stage")).toBe(true);
    expect(
      screen.getByText("Studio-style practice workspace for score reading, playback, and loop training."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开乐谱" })).toBeTruthy();

    await application.destroy();
  });

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

  it("opens a structured practice control bay instead of a loose settings drawer", async () => {
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );
    const user = userEvent.setup();
    render(<App application={application} />);
    await user.click(screen.getByRole("button", { name: "练习设置" }));
    expect(screen.getByRole("complementary", { name: "练习设置" }).classList.contains("practice-panel")).toBe(true);
    expect(screen.getByText("Loop").classList.contains("panel-title")).toBe(true);
    expect(screen.getByText("Tracks").classList.contains("panel-title")).toBe(true);
    await application.destroy();
  });

  it("renders the library route when persistent library dependencies are provided", async () => {
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => {
        throw new Error("unused");
      },
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );
    render(<App application={application} />);
    expect(await screen.findByRole("heading", { name: "曲谱库" })).toBeTruthy();
    await application.destroy();
  });
});
