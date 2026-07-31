// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportItemResult, LibraryScore } from "@zupulse/web-core";
import type { ViewerApplication } from "../../app/ViewerApplication";
import { SheetLibrary } from "../SheetLibrary";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SheetLibrary import summary", () => {
  it("auto-dismisses a compact single-file success after four seconds", () => {
    vi.useFakeTimers();
    const dismissImportSummary = vi.fn();
    const score = libraryScore();

    render(
      <SheetLibrary
        application={{ dismissImportSummary } as unknown as ViewerApplication}
        scores={[score]}
        loading={false}
        importSummary={{
          total: 1,
          results: [{ status: "created", score }],
          cancelled: 0,
          running: false,
        }}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Created 已加入曲谱库");
    expect(screen.queryByText("查看逐项结果")).toBeNull();
    act(() => vi.advanceTimersByTime(3999));
    expect(dismissImportSummary).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dismissImportSummary).toHaveBeenCalledOnce();
  });

  it("keeps batch and non-created results until the user dismisses them", () => {
    vi.useFakeTimers();
    const dismissImportSummary = vi.fn();
    const score = libraryScore();

    render(
      <SheetLibrary
        application={{ dismissImportSummary } as unknown as ViewerApplication}
        scores={[score]}
        loading={false}
        importSummary={{
          total: 2,
          results: [
            { status: "created", score },
            { status: "existing", score: { ...score, fileName: "existing.gp" } },
          ],
          cancelled: 0,
          running: false,
        }}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole("region", { name: /导入汇总/ })).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(dismissImportSummary).not.toHaveBeenCalled();
  });

  it("shows created, existing, failed and cancelled counts with structured details", async () => {
    const cancelImport = vi.fn();
    const dismissImportSummary = vi.fn();
    const application = {
      cancelImport,
      dismissImportSummary,
    } as unknown as ViewerApplication;
    const score = libraryScore();
    const results: ImportItemResult[] = [
      { status: "created", score },
      { status: "existing", score: { ...score, fileName: "existing.gp" } },
      { status: "failed", fileName: "broken.gp", error: { code: "INVALID_SCORE" } },
    ];
    const user = userEvent.setup();

    const { rerender } = render(
      <SheetLibrary
        application={application}
        scores={[]}
        loading={false}
        importing
        importSummary={{ total: 4, results, cancelled: 0, running: true }}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "导入汇总：新增 1，已存在 1，失败 1，未开始 0",
      }),
    ).toBeTruthy();
    expect(screen.getByText("新增 1")).toBeTruthy();
    expect(screen.getByText("已存在 1")).toBeTruthy();
    expect(screen.getByText("失败 1")).toBeTruthy();
    expect(screen.getByText("失败 · INVALID_SCORE")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消未开始项" }));
    expect(cancelImport).toHaveBeenCalledOnce();

    rerender(
      <SheetLibrary
        application={application}
        scores={[]}
        loading={false}
        importing={false}
        importSummary={{ total: 4, results, cancelled: 1, running: false }}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText("未开始 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(dismissImportSummary).toHaveBeenCalledOnce();
  });
});

describe("SheetLibrary score actions", () => {
  it("exposes opening, favorite, and management as distinct controls", async () => {
    const application = libraryApplication();
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={application}
        scores={[libraryScore()]}
        loading={false}
        {...emptyImportProps()}
        onOpen={onOpen}
      />,
    );

    const scoreItem = screen.getByRole("listitem");
    await user.click(within(scoreItem).getByRole("button", { name: "打开 Created" }));
    expect(onOpen).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");

    expect(within(scoreItem).getByRole("button", { name: "收藏 Created" }).querySelector(".lucide-star")).toBeTruthy();
    const actionsButton = within(scoreItem).getByRole("button", { name: "Created 的更多操作" });
    expect(actionsButton.querySelector(".lucide-ellipsis")).toBeTruthy();
    fireEvent.mouseDown(actionsButton);
    expect(await screen.findByRole("menuitem", { name: "导出 Created" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "编辑 Created" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "删除 Created" })).toBeTruthy();
  });

  it("uses native list semantics without hijacking arrow keys from row controls", () => {
    const first = libraryScore();
    const second: LibraryScore = {
      ...libraryScore(),
      id: "00000000-0000-4000-8000-000000000002",
      title: "Second",
    };

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[first, second]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(screen.queryByRole("listbox")).toBeNull();
    const open = screen.getByRole("button", { name: "打开 Created" });
    open.focus();
    fireEvent.keyDown(open, { key: "ArrowDown" });
    expect(document.activeElement).toBe(open);
  });

  it("offers a truthful continue action with a one-based measure number", async () => {
    const onOpen = vi.fn();
    const fresh = libraryScore();
    const practiced: LibraryScore = {
      ...libraryScore(),
      id: "00000000-0000-4000-8000-000000000002",
      title: "Practiced",
      artist: "Player",
      practice: {
        hasLoop: true,
        lastPracticedAt: "2026-07-26T10:00:00.000Z",
        lastPosition: {
          measureId: "measure-7",
          measureIndex: 6,
          beatIndex: 0,
          tick: 11520,
          cachedTimeMs: 24000,
        },
      },
    };

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[fresh, practiced]}
        loading={false}
        {...emptyImportProps()}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole("button", { name: "打开 Created" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续练习 Practiced" })).toBeTruthy();
    expect(screen.getByText(/上次练到第 7 小节/)).toBeTruthy();
    expect(screen.queryByText("尚未练习")).toBeNull();
    expect(screen.queryByText("Library")).toBeNull();
  });

  it("cancels permanent deletion with Escape and restores focus to the actions trigger", async () => {
    const application = libraryApplication();
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={application}
        scores={[libraryScore()]}
        loading={false}
        onImport={async () => undefined}
        onOpen={() => undefined}
      />,
    );

    const actionsTrigger = screen.getByRole("button", { name: "Created 的更多操作" });
    await user.click(actionsTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "删除 Created" }));

    const dialog = await screen.findByRole("alertdialog", { name: "删除“Created”吗？" });
    expect(within(dialog).getByText("曲谱文件和全部练习数据将被永久删除，且无法恢复。")).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "取消" }));
    });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(actionsTrigger);
    });
    expect(application.deleteLibraryScore).not.toHaveBeenCalled();
  });
});

describe("SheetLibrary edit dialog", () => {
  it("opens edit dialog and restores focus on cancel", async () => {
    const application = libraryApplication();
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={application}
        scores={[libraryScore()]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    const actionsTrigger = screen.getByRole("button", { name: "Created 的更多操作" });
    await user.click(actionsTrigger);
    await user.click(await screen.findByRole("menuitem", { name: "编辑 Created" }));

    const dialog = await screen.findByRole("dialog", { name: "编辑曲谱信息" });
    expect(within(dialog).getByLabelText("标题")).toBeTruthy();
    expect(within(dialog).getByLabelText("艺术家")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(actionsTrigger);
    });
  });
});

describe("SheetLibrary stats summary", () => {
  it("does not describe a missing practice summary as never practiced", () => {
    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore()]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByText("1 份曲谱 · 0 个循环")).toBeTruthy();
    expect(screen.queryByText("尚未练习")).toBeNull();
  });

  it("shows total scores, loops count and last practiced time", () => {
    const scoreWithLoop: LibraryScore = {
      ...libraryScore(),
      id: "00000000-0000-4000-8000-000000000002",
      title: "WithLoop",
      practice: {
        hasLoop: true,
        lastPracticedAt: "2026-07-26T10:00:00.000Z",
      },
    };

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore(), scoreWithLoop]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    const statsSummary = screen.getByText(/2 份曲谱 · 1 个循环 · 最近练习/);
    expect(statsSummary).toBeTruthy();
  });
});

describe("SheetLibrary no-results state", () => {
  it("exposes the sort control with its visible label", () => {
    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore()]}
        loading={false}
        onImport={async () => undefined}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: "排序" })).toBeTruthy();
  });

  it("explains a search miss and clears the search without showing the empty-library import action", async () => {
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore()]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "搜索曲名或艺术家" }), "不存在");
    await waitFor(() => {
      expect(screen.getByText("没有匹配“不存在”的曲谱")).toBeTruthy();
    });
    expect(screen.getByText("0 / 1 份曲谱")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "导入第一份曲谱" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "打开 Created" })).toBeTruthy();
    });
  });

  it("explains an empty favorites filter and clears all filters", async () => {
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore()]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "收藏" }));
    expect(screen.getByText("收藏中还没有曲谱")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "清除全部筛选" }));
    expect(screen.getByRole("button", { name: "打开 Created" })).toBeTruthy();
  });
});

describe("SheetLibrary import dialog", () => {
  it("uses the primary accent treatment for Library import actions", () => {
    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "导入曲谱" }).className).toContain("tw:bg-accent");
    expect(screen.getByRole("button", { name: "导入自己的曲谱" }).className).toContain("tw:bg-accent");
  });

  it("fully removes the modal layer after pointer dismissal", async () => {
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    const trigger = screen.getByRole("button", { name: "导入自己的曲谱" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "导入曲谱" })).toBeTruthy();

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "导入曲谱" })).toBeNull();
      expect(document.querySelector("[data-base-ui-portal]")).toBeNull();
    });
    const favorites = screen.getByRole("button", { name: "收藏" });
    await user.click(favorites);
    expect(favorites.getAttribute("aria-pressed")).toBe("true");
  });

  it("uses the wider import-specific dialog width", async () => {
    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        {...emptyImportProps()}
        onOpen={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "导入自己的曲谱" }));

    expect(screen.getByRole("dialog", { name: "导入曲谱" }).className).toContain("tw:max-w-2xl");
  });

  it("adds a bundled sample to the normal candidate list before submission", async () => {
    const sample = {
      id: "first-light-practice",
      title: "First Light Practice",
      fileName: "first-light-practice.mxl",
      format: "musicxml",
      attribution: "Zupulse",
      license: "CC0-1.0",
      sha256: "ec1a465e7a0796637122f8c74b0fe16c798c4cb8d82121eb850152d1d3c177ec",
    } as const;
    const source = { fileName: sample.fileName, readBytes: async () => new Uint8Array([1]) };
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => []}
        sampleScores={[sample]}
        onSelectSample={() => source}
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    await userEvent.click(screen.getByRole("button", { name: "使用样例 First Light Practice" }));
    expect(screen.getByText("first-light-practice.mxl")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "导入 1 份" }));
    expect(onImportSources).toHaveBeenCalledWith([source]);
  });

  it("adds Browser-dropped files to the same candidate list", async () => {
    const droppedFile = new File([new Uint8Array([7, 8, 9])], "dropped.mxl");
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => []}
        onDropImportFiles={(files) =>
          files.map((file) => ({
            fileName: file.name,
            readBytes: async () => new Uint8Array([7, 8, 9]),
          }))
        }
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    const dropZone = screen.getByRole("button", { name: "选择文件或拖放文件" });
    fireEvent.dragEnter(dropZone, { dataTransfer: { files: [droppedFile] } });
    expect(screen.getByText("释放后添加文件")).toBeTruthy();
    fireEvent.drop(dropZone, { dataTransfer: { files: [droppedFile] } });

    expect(screen.getByText("dropped.mxl")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "导入 1 份" }));
    const submitted = onImportSources.mock.calls[0]?.[0]?.[0];
    expect(submitted?.fileName).toBe("dropped.mxl");
    await expect(submitted?.readBytes()).resolves.toEqual(new Uint8Array([7, 8, 9]));
  });

  it("skips unsupported dropped files before they reach the candidate list", async () => {
    const supported = new File([new Uint8Array([1])], "song.mxl");
    const unsupported = new File([new Uint8Array([2])], "notes.txt");
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => []}
        onDropImportFiles={(files) =>
          files.map((file) => ({
            fileName: file.name,
            readBytes: async () => new Uint8Array([7, 8, 9]),
          }))
        }
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    const dropZone = screen.getByRole("button", { name: "选择文件或拖放文件" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [supported, unsupported] } });

    expect(screen.getByText("song.mxl")).toBeTruthy();
    expect(screen.queryByText("notes.txt")).toBeNull();
    expect(screen.getByText("已跳过 1 份不支持的文件，仅支持 Guitar Pro、MusicXML 和 MXL。")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "导入 1 份" }));
    expect(onImportSources).toHaveBeenCalledWith([expect.objectContaining({ fileName: "song.mxl" })]);
  });

  it("skips unsupported selected files before they reach the candidate list", async () => {
    const user = userEvent.setup();
    const supported = { fileName: "song.gp5", readBytes: async () => new Uint8Array([1]) };
    const unsupported = { fileName: "archive.zip", readBytes: async () => new Uint8Array([2]) };
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => [supported, unsupported]}
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    await user.click(screen.getByRole("button", { name: "选择文件" }));

    expect(screen.getByText("song.gp5")).toBeTruthy();
    expect(screen.queryByText("archive.zip")).toBeNull();
    expect(screen.getByText("已跳过 1 份不支持的文件，仅支持 Guitar Pro、MusicXML 和 MXL。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "导入 1 份" }));
    expect(onImportSources).toHaveBeenCalledWith([supported]);
  });

  it("keeps the submit action disabled when every selected file is unsupported", async () => {
    const user = userEvent.setup();
    const unsupported = { fileName: "performance.mid", readBytes: async () => new Uint8Array([1]) };
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => [unsupported]}
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    await user.click(screen.getByRole("button", { name: "选择文件" }));

    expect(screen.queryByText("performance.mid")).toBeNull();
    expect(screen.getByText("已跳过 1 份不支持的文件，仅支持 Guitar Pro、MusicXML 和 MXL。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "导入 0 份" })).toHaveProperty("disabled", true);
    expect(onImportSources).not.toHaveBeenCalled();
  });

  it("reviews selected files before submitting the remaining candidates", async () => {
    const user = userEvent.setup();
    const first = { fileName: "first.gp5", readBytes: async () => new Uint8Array([1]) };
    const second = { fileName: "second.mxl", readBytes: async () => new Uint8Array([2]) };
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => [first, second]}
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "导入自己的曲谱" }));
    expect(screen.getByRole("dialog", { name: "导入曲谱" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "选择文件" }));
    expect(screen.getByText("first.gp5")).toBeTruthy();
    expect(screen.getByText("second.mxl")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "移除 first.gp5" }));
    await user.click(screen.getByRole("button", { name: "导入 1 份" }));

    expect(onImportSources).toHaveBeenCalledWith([second]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "导入曲谱" })).toBeNull();
    });
  });

  it("cancels without submitting and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const candidate = { fileName: "cancelled.gp", readBytes: async () => new Uint8Array([1]) };
    const onImportSources = vi.fn(async () => undefined);

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[]}
        loading={false}
        onSelectImportFiles={async () => [candidate]}
        onImportSources={onImportSources}
        onOpen={() => undefined}
      />,
    );

    const trigger = screen.getByRole("button", { name: "导入自己的曲谱" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "选择文件" }));
    expect(screen.getByText("cancelled.gp")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onImportSources).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    expect(screen.queryByText("cancelled.gp")).toBeNull();
  });
});

function libraryApplication(): ViewerApplication {
  return {
    setFavorite: vi.fn(async () => undefined),
    refreshLibrary: vi.fn(async () => undefined),
    exportLibraryScore: vi.fn(async () => undefined),
    deleteLibraryScore: vi.fn(async () => undefined),
  } as unknown as ViewerApplication;
}

function emptyImportProps() {
  return {
    onSelectImportFiles: async () => [],
    onImportSources: async () => undefined,
  };
}

function libraryScore(): LibraryScore {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    scoreIdentity: "a".repeat(64),
    fileName: "created.gp",
    format: "gp",
    title: "Created",
    importedAt: "2026-07-24T00:00:00.000Z",
    isFavorite: false,
    practice: { hasLoop: false },
    metadata: {},
  };
}
