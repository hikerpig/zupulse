// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ViewerApplication } from "../ViewerApplication";
import type {
  HarmonyAnalysisRepository,
  ScoreFormatAdapter,
  ScoreImportSource,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import { createAppI18n } from "@zupulse/app-i18n";
import type { LocaleHost } from "../../i18n/locale-controller";
import type { ViewerSessionPort } from "../../viewer-session/viewer-session-types";

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

function libraryFixture(): {
  repository: SheetLibraryRepository;
  gateway: { selectForImport(): Promise<ScoreImportSource[]>; saveExport(): Promise<"saved" | "cancelled"> };
  adapters: readonly ScoreFormatAdapter[];
} {
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
  return {
    repository,
    gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
    adapters: [],
  };
}
function viewerSession(): ViewerSessionPort {
  return {
    getSnapshot: () => ({ loopEditor: { measureBounds: [], staffBounds: [] } }),
    subscribe: () => () => undefined,
    dispatch: async () => undefined,
    destroy: async () => undefined,
  };
}

describe("App", () => {
  it("switches locale without rebuilding the application", async () => {
    window.history.replaceState(null, "", "#/");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
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
    await user.click(await screen.findByRole("button", { name: "语言" }));
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "A practice workbench for reading and playing scores" }),
    ).toBeTruthy();
    expect(localeHost.setPreference).toHaveBeenLastCalledWith("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    await application.destroy();
  });

  it("keeps the previous locale when persistence fails", async () => {
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession());
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
    window.history.replaceState(null, "", "#/library");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );

    render(<App application={application} />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要页面" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "逐拍首页" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "曲谱库" })).toBeTruthy();
    await application.destroy();
  });

  it("routes external links through the native host when available", async () => {
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );
    const openExternalUrl = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(<App application={application} externalNavigationHost={{ openExternalUrl }} />);
    await user.click(screen.getByRole("link", { name: "GitHub 仓库" }));

    expect(openExternalUrl).toHaveBeenCalledWith("https://github.com/hikerpig/zupulse");
    await application.destroy();
  });

  it("opens a structured practice control bay instead of a loose settings drawer", async () => {
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
      readScore: async () => ({ fileName: "score-a.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession(), {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
    const user = userEvent.setup();
    render(<App application={application} />);

    await user.click(await screen.findByRole("button", { name: "练习设置" }));
    const practice = screen.getByRole("complementary", { name: "练习设置" });
    expect(within(practice).getByRole("button", { name: "设置循环区间" })).toBeTruthy();
    expect(within(practice).getByRole("button", { name: "选择主轨道" })).toBeTruthy();
    expect(within(practice).queryByText("Session")).toBeNull();
    await application.destroy();
  });

  it("renders the library route when persistent library dependencies are provided", async () => {
    window.history.replaceState(null, "", "#/library");
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession(), {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
    render(<App application={application} />);
    expect(await screen.findByRole("heading", { name: "曲谱库" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "曲谱库" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "首页" }).getAttribute("aria-current")).toBeNull();
    await application.destroy();
  });

  it("renders the home product introduction at the root route", async () => {
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession());
    render(<App application={application} />);

    expect(await screen.findByRole("heading", { name: "识谱与弹奏练习工作台" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "读谱练习 VIEWER" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "和声分析 STUDIO" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "曲库与文件 LIBRARY" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "打开曲库" }).getAttribute("href")).toBe("#/library");
    expect(screen.getByRole("link", { name: "首页" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "曲谱库" }).getAttribute("aria-current")).toBeNull();
    await application.destroy();
  });

  it("omits the harmony analysis section when the capability is unavailable", async () => {
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession());
    render(<App application={application} capabilities={{ harmonyAnalysis: false }} />);

    expect(await screen.findByRole("heading", { name: "识谱与弹奏练习工作台" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "读谱练习 VIEWER" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "和声分析 STUDIO" })).toBeNull();
    expect(screen.getByRole("heading", { name: "曲库与文件 LIBRARY" })).toBeTruthy();
    await application.destroy();
  });

  it("exposes the PDF recognition route only when the Desktop capability is enabled", async () => {
    window.history.replaceState(null, "", "#/pdf-omr");
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
    );

    render(<App application={application} capabilities={{ harmonyAnalysis: false, pdfOmrWorkbench: true }} />);

    expect(await screen.findByRole("heading", { name: "PDF 识谱" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "PDF 识谱" })).toBeTruthy();
    await application.destroy();
  });

  it("opens shared application settings from the Header and keeps Browser settings limited to General", async () => {
    window.history.replaceState(null, "", "#/settings");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );

    render(<App application={application} />);

    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "设置" }).getAttribute("href")).toBe("#/settings");
    expect(screen.getByRole("heading", { name: "通用" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "识谱引擎" })).toBeNull();
    await application.destroy();
  });

  it("updates the same theme state from General settings and the Header shortcut", async () => {
    window.history.replaceState(null, "", "#/settings");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );
    const user = userEvent.setup();

    render(<App application={application} />);
    await user.click(await screen.findByRole("radio", { name: "浅色" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "切换至深色主题" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "浅色" }) as HTMLInputElement).checked).toBe(true);
    await application.destroy();
  });

  it("updates the same locale state from General settings and the Header shortcut", async () => {
    window.history.replaceState(null, "", "#/settings");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
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
    await user.click(await screen.findByRole("radio", { name: "English" }));

    expect(localeHost.setPreference).toHaveBeenCalledWith("en-US");
    expect(await screen.findByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Language" })).toBeTruthy();
    await application.destroy();
  });

  it("lists every local recognition provider only when the host supplies the settings capability", async () => {
    window.history.replaceState(null, "", "#/settings");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );
    const recognitionSettings = {
      list: vi.fn(async () =>
        (["audiveris", "rokot", "legato"] as const).map((id) => ({
          id,
          state: "unconfigured" as const,
          inputKinds: id === "audiveris" ? (["pdf", "image"] as const) : (["pdf"] as const),
          hasExplicitConfiguration: false,
          fields: [],
        })),
      ),
      selectResource: vi.fn(),
      save: vi.fn(),
      clear: vi.fn(),
    };

    render(
      <App
        application={application}
        capabilities={{ harmonyAnalysis: false, recognitionProviderSettings: true }}
        recognitionSettings={recognitionSettings}
      />,
    );

    expect(await screen.findByRole("heading", { name: "识谱引擎" })).toBeTruthy();
    for (const name of ["Audiveris", "Rokot", "LEGATO"]) {
      expect(await screen.findByText(name, { selector: "strong" })).toBeTruthy();
    }
    expect(screen.queryByText("Transcoda", { selector: "strong" })).toBeNull();
    expect(recognitionSettings.list).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("saves a recognition engine path pasted into the field", async () => {
    window.history.replaceState(null, "", "#/settings");
    const application = new ViewerApplication(
      { subscribe: () => () => undefined },
      async () => viewerSession(),
      libraryFixture(),
    );
    const audiveris = {
      id: "audiveris" as const,
      state: "unconfigured" as const,
      inputKinds: ["pdf", "image"] as const,
      hasExplicitConfiguration: false,
      fields: [],
    };
    const recognitionSettings = {
      list: vi.fn(async () => [
        audiveris,
        {
          id: "rokot" as const,
          state: "unconfigured" as const,
          inputKinds: ["pdf"] as const,
          hasExplicitConfiguration: false,
          fields: [],
        },
        {
          id: "legato" as const,
          state: "unconfigured" as const,
          inputKinds: ["pdf"] as const,
          hasExplicitConfiguration: false,
          fields: [],
        },
      ]),
      selectResource: vi.fn(async (_providerId: string, _fieldId: string, path?: string) => ({
        status: "selected" as const,
        selectionToken: "manual-selection",
        label: path?.split("/").at(-1) ?? "Audiveris",
        kind: "executable" as const,
      })),
      save: vi.fn(async () => ({ ...audiveris, state: "ready" as const, version: "5.3" })),
      clear: vi.fn(),
    };
    const user = userEvent.setup();

    render(
      <App
        application={application}
        capabilities={{ harmonyAnalysis: false, recognitionProviderSettings: true }}
        recognitionSettings={recognitionSettings}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Audiveris 配置" }));
    const field = screen.getByRole("textbox", { name: "可执行程序" });
    await user.click(screen.getByRole("button", { name: "选择 可执行程序" }));
    expect(recognitionSettings.selectResource).toHaveBeenCalledWith("audiveris", "executable");
    expect((field as HTMLInputElement).value).toBe("Audiveris");
    await user.clear(field);
    await user.type(field, "/opt/audiveris/bin/Audiveris");
    await user.click(screen.getByRole("button", { name: "验证并保存" }));

    expect(recognitionSettings.selectResource).toHaveBeenCalledWith(
      "audiveris",
      "executable",
      "/opt/audiveris/bin/Audiveris",
    );
    expect(recognitionSettings.save).toHaveBeenCalledWith("audiveris", {
      executable: { source: "selection", selectionToken: "manual-selection" },
    });
    await application.destroy();
  });

  it("keeps the incomplete viewer hidden until the requested session is ready", async () => {
    window.history.replaceState(null, "", "#/library");
    const id = "8f14e45f-ea42-4c2e-a9f4-6f1f8f60d88a";
    let resolveOpenSession: ((session: ViewerSessionPort) => void) | undefined;
    const pendingSession = new Promise<ViewerSessionPort>((resolve) => {
      resolveOpenSession = resolve;
    });
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => pendingSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
    const user = userEvent.setup();
    render(<App application={application} />);

    await user.click(await screen.findByRole("button", { name: "打开 Score A" }));

    await waitFor(() => expect(window.location.hash).toBe(`#/viewer/${id}`));
    expect((await screen.findByRole("status", { name: "正在加载文件" })).getAttribute("id")).toBeNull();
    expect(screen.queryByText("会话已结束，请重新打开乐谱")).toBeNull();

    resolveOpenSession?.(viewerSession());
    await waitFor(() => expect(window.location.hash).toBe(`#/viewer/${id}`));
    expect(screen.getByRole("heading", { name: "Score A" })).toBeTruthy();
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession(), {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
    render(<App application={application} />);

    const libraryLink = await screen.findByRole("link", { name: "曲谱库" });
    expect(libraryLink.getAttribute("href")).toBe("#/library");
    expect(libraryLink.querySelector("svg.lucide-library-big")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看器" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "和弦工作室" }).getAttribute("href")).toBe(`#/studio/${id}`);
    expect(screen.queryByRole("button", { name: "导入曲谱" })).toBeNull();
    await application.destroy();
  });

  it("offers Studio navigation only after the routed Viewer session is ready", async () => {
    const id = "8f14e45f-ea42-4c2e-a9f4-6f1f8f60d88a";
    window.history.replaceState(null, "", `#/viewer/${id}`);
    let resolveOpenSession: ((session: ViewerSessionPort) => void) | undefined;
    const pendingSession = new Promise<ViewerSessionPort>((resolve) => {
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => pendingSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });

    render(<App application={application} />);
    await screen.findByRole("status", { name: "正在加载文件" });
    expect(screen.queryByRole("link", { name: "和弦分析" })).toBeNull();

    resolveOpenSession?.(viewerSession());
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
      { subscribe: () => () => undefined },
      async () => {
        throw new Error("unused");
      },
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
      openStudioRuntime,
    );

    render(<App application={application} capabilities={{ harmonyAnalysis: false }} />);

    expect(await screen.findByRole("heading", { name: "和弦分析暂不可用" })).toBeTruthy();
    expect(await screen.findByText("C 大调前奏曲")).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回查看器" }).getAttribute("href")).toBe(`#/viewer/${id}`);
    expect(screen.getByRole("link", { name: "返回曲谱库" }).getAttribute("href")).toBe("#/library");
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, async () => viewerSession(), {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });

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
    const openSession = vi.fn(async () => viewerSession());
    const application = new ViewerApplication({ subscribe: () => () => undefined }, openSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
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

  it("reopens the same score after returning to the library through the logo and home entry", async () => {
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
      getSnapshot: () => ({ loopEditor: { measureBounds: [], staffBounds: [] } }),
      subscribe: () => () => undefined,
      dispatch: async () => undefined,
      destroy,
    }));
    const application = new ViewerApplication({ subscribe: () => () => undefined }, openSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });
    const user = userEvent.setup();
    render(<App application={application} />);

    await waitFor(() => expect(application.hasSession(id)).toBe(true));
    await user.click(screen.getByRole("link", { name: "逐拍首页" }));
    expect(await screen.findByRole("heading", { name: "识谱与弹奏练习工作台" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "打开曲库" }));
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
