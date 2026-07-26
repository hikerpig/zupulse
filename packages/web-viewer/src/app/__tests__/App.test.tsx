// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ViewerApplication } from "../ViewerApplication";
import type { HarmonyAnalysisRepository, SheetLibraryRepository } from "@zupulse/web-core";
import { createAppI18n } from "@zupulse/app-i18n";
import type { LocaleHost } from "../../i18n/locale-controller";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "#/");
});

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  if (!window.localStorage)
    Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });
  window.localStorage?.clear();
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
    expect(screen.getByRole("heading", { name: "No score open" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Playback controls" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open score" })).toBeTruthy();
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
    expect(screen.queryByText("Score Viewer")).toBeNull();
    expect(screen.queryByText("用于乐谱阅读、播放和循环训练的练习工作区。")).toBeNull();
    expect(screen.queryByText("等待选择文件")).toBeNull();
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

    const switchToLight = screen.getByRole("button", { name: "切换至浅色主题" });
    expect(switchToLight.textContent).toContain("深色");
    await user.click(switchToLight);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("zupulse-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "切换至深色主题" }).textContent).toContain("浅色");
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
    expect(screen.queryByRole("button", { name: "导入曲谱" })).toBeNull();
    await application.destroy();
  });

  it("offers Studio navigation only after the routed Viewer session is ready", async () => {
    const id = "8f14e45f-ea42-4c2e-a9f4-6f1f8f60d88a";
    window.history.replaceState(null, "", `#/viewer/${id}`);
    let resolveOpenSession:
      | ((session: {
          togglePlayback(): Promise<void>;
          pauseAndFlush(): Promise<void>;
          destroy(): Promise<void>;
        }) => void)
      | undefined;
    const pendingSession = new Promise<{
      togglePlayback(): Promise<void>;
      pauseAndFlush(): Promise<void>;
      destroy(): Promise<void>;
    }>((resolve) => {
      resolveOpenSession = resolve;
    });
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score.musicxml", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => undefined,
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
      read: async () => null,
      save: async () => {
        throw new Error("unused");
      },
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => pendingSession,
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    render(<App application={application} />);
    await screen.findByText("会话已结束，请重新打开乐谱");
    expect(screen.queryByRole("link", { name: "和弦分析" })).toBeNull();

    resolveOpenSession?.({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy: async () => undefined,
    });
    expect(await screen.findByRole("link", { name: "和弦分析" })).toBeTruthy();
    await application.destroy();
  });

  it("renders an iPad Studio unavailable route without reading score bytes or analysis storage", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    window.history.replaceState(null, "", `#/studio/${id}`);
    const readScore = vi.fn(async () => {
      throw new Error("must not read score bytes");
    });
    const readAnalysis = vi.fn(async () => null);
    const openStudioRuntime = vi.fn(async () => {
      throw new Error("must not create Studio runtime");
    });
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => ({
        id,
        scoreIdentity: "a".repeat(64),
        fileName: "prelude.musicxml",
        format: "musicxml",
        title: "C 大调前奏曲",
        importedAt: "2026-07-24T00:00:00.000Z",
        isFavorite: false,
        practice: { hasLoop: false },
        metadata: {},
      }),
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore,
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
      read: readAnalysis,
      save: async () => {
        throw new Error("unused");
      },
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => {
        throw new Error("unused");
      },
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
      openStudioRuntime,
    );

    render(<App application={application} capabilities={{ harmonyAnalysis: false }} />);

    expect(await screen.findByRole("heading", { name: "和弦分析暂不可用" })).toBeTruthy();
    expect(screen.getByText("C 大调前奏曲")).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回查看器" }).getAttribute("href")).toBe(`#/viewer/${id}`);
    expect(screen.getByRole("link", { name: "返回曲谱库" }).getAttribute("href")).toBe("#/");
    expect(screen.queryByRole("link", { name: "和弦工作室" })).toBeNull();
    expect(readScore).not.toHaveBeenCalled();
    expect(readAnalysis).not.toHaveBeenCalled();
    expect(openStudioRuntime).not.toHaveBeenCalled();
    await application.destroy();
  });

  it("hides Studio entry points when harmony analysis is unavailable", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    window.history.replaceState(null, "", `#/viewer/${id}`);
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }),
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

    render(<App application={application} capabilities={{ harmonyAnalysis: false }} />);

    expect(await screen.findByRole("link", { name: "查看器" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "和弦工作室" })).toBeNull();
    expect(screen.queryByRole("link", { name: "和弦分析" })).toBeNull();
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
    await user.click(await screen.findByRole("button", { name: "打开 Second" }));

    await waitFor(() => expect(window.location.hash).toBe(`#/viewer/${secondId}`));
    await waitFor(() => expect(application.hasSession(secondId)).toBe(true));
    expect(openSession).toHaveBeenCalledTimes(2);
    await application.destroy();
  });

  it("reopens the same score after returning to the library through the logo", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    window.history.replaceState(null, "", `#/viewer/${id}`);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("browser");
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [
        {
          id,
          title: "Score A",
          fileName: "score-a.gp",
          scoreIdentity: "a".repeat(64),
          format: "gp",
          importedAt: "2026-07-13T00:00:00.000Z",
          isFavorite: false,
          practice: { hasLoop: false },
        },
      ],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score-a.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const destroy = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => ({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy,
    }));
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );
    const user = userEvent.setup();
    render(<App application={application} />);

    await waitFor(() => expect(application.hasSession(id)).toBe(true));
    await user.click(screen.getByRole("link", { name: "逐拍首页" }));
    await user.click(await screen.findByRole("button", { name: "打开 Score A" }));

    await waitFor(() => expect(application.hasSession(id)).toBe(true));
    expect(openSession).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
    await application.destroy();
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}
