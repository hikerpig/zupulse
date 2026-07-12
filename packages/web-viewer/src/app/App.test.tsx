// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ViewerApplication } from "./ViewerApplication";
import type { SheetLibraryRepository } from "@tab-viewer/web-core";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

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
    expect(document.documentElement.dataset.theme).toBe("dark");
    await application.destroy();
  });
});
