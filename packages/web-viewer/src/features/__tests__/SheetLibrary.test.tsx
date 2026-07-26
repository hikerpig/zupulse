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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
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
        onImport={async () => undefined}
        onOpen={() => undefined}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "搜索曲名或艺术家" }), "不存在");

    expect(screen.getByText("没有匹配“不存在”的曲谱")).toBeTruthy();
    expect(screen.getByText("0 / 1 份曲谱")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "导入第一份曲谱" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getByRole("button", { name: "打开 Created" })).toBeTruthy();
  });

  it("explains an empty favorites filter and clears all filters", async () => {
    const user = userEvent.setup();

    render(
      <SheetLibrary
        application={libraryApplication()}
        scores={[libraryScore()]}
        loading={false}
        onImport={async () => undefined}
        onOpen={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "收藏" }));
    expect(screen.getByText("收藏中还没有曲谱")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "清除全部筛选" }));
    expect(screen.getByRole("button", { name: "打开 Created" })).toBeTruthy();
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
