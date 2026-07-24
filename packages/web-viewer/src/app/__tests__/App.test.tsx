// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ViewerApplication } from "../ViewerApplication";
import type { SheetLibraryRepository } from "@zupulse/web-core";
import { createAppI18n } from "@zupulse/app-i18n";
import type { LocaleHost } from "../../i18n/locale-controller";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "#/");
});

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});

describe("App", () => {
  it("switches locale without rebuilding the application", async () => {
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );
    const localeHost: LocaleHost = {
      initialState: { preference: "zh-CN", effectiveLocale: "zh-CN" },
      setPreference: vi.fn(async (preference) => ({
        preference,
        effectiveLocale: preference === "system" ? "zh-CN" : preference,
      })),
    };
    const user = userEvent.setup();

    render(<App application={application} localeHost={localeHost} i18n={createAppI18n("zh-CN")} />);
    await user.click(screen.getByRole("button", { name: "语言" }));
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(localeHost.setPreference).toHaveBeenLastCalledWith("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    await application.destroy();
  });

  it("keeps the previous locale when persistence fails", async () => {
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );
    const localeHost: LocaleHost = {
      initialState: { preference: "zh-CN", effectiveLocale: "zh-CN" },
      setPreference: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    };
    const user = userEvent.setup();

    render(<App application={application} localeHost={localeHost} i18n={createAppI18n("zh-CN")} />);
    await user.click(screen.getByRole("button", { name: "语言" }));
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect((await screen.findByRole("alert")).textContent).toContain("无法保存语言设置");
    expect(screen.getByRole("navigation", { name: "主要页面" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
    await application.destroy();
  });

  it("renders a compact workbench shell instead of detached cards", async () => {
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );

    render(<App application={application} />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要页面" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "逐拍首页" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "乐谱工作区" })).toBeTruthy();
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

    await user.click(screen.getByRole("button", { name: "切换至浅色主题" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("zupulse-theme")).toBe("light");
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
    expect(screen.getByRole("complementary", { name: "练习设置" })).toBeTruthy();
    expect(screen.getByText("Loop")).toBeTruthy();
    expect(screen.getByText("Tracks")).toBeTruthy();
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

  it("offers library navigation from a viewer route", async () => {
    const id = "8f14e45f-ea42-4c2e-a9f4-6f1f8f60d88a";
    window.history.replaceState(null, "", `#/viewer/${id}`);
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "test.gp", bytes: new Uint8Array() }),
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

    const libraryLink = await screen.findByRole("link", { name: "曲谱库" });
    expect(libraryLink.getAttribute("href")).toBe("#/");
    expect(libraryLink.querySelector("svg.lucide-library-big")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看器" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "和弦工作室" }).getAttribute("href")).toBe(`#/studio/${id}`);
    await application.destroy();
  });

  it("keeps a library click on the requested score instead of restoring the previous route", async () => {
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    window.history.replaceState(null, "", `#/viewer/${firstId}`);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("browser");
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () =>
        [
          { id: firstId, title: "First", fileName: "first.gp", scoreIdentity: "1".repeat(64) },
          { id: secondId, title: "Second", fileName: "second.gp", scoreIdentity: "2".repeat(64) },
        ].map((score) => ({
          ...score,
          format: "gp" as const,
          importedAt: "2026-07-13T00:00:00.000Z",
          isFavorite: false,
          practice: { hasLoop: false },
        })),
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async (id) => ({ fileName: `${id}.gp`, bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const openSession = vi.fn(async () => ({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy: async () => undefined,
    }));
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );
    const user = userEvent.setup();
    render(<App application={application} />);

    await waitFor(() => expect(application.hasSession(firstId)).toBe(true));
    await user.click(screen.getByRole("link", { name: "曲谱库" }));
    await user.click((await screen.findByText("Second")).closest("[role='button']")!);

    await waitFor(() => expect(window.location.hash).toBe(`#/viewer/${secondId}`));
    await waitFor(() => expect(application.hasSession(secondId)).toBe(true));
    expect(openSession).toHaveBeenCalledTimes(2);
    await application.destroy();
  });
});
