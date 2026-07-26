// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportItemResult, LibraryScore } from "@zupulse/web-core";
import type { ViewerApplication } from "../../app/ViewerApplication";
import { SheetLibrary } from "../SheetLibrary";

afterEach(cleanup);

describe("SheetLibrary import summary", () => {
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

    expect(within(scoreItem).getByRole("button", { name: "收藏 Created" })).toBeTruthy();
    fireEvent.mouseDown(within(scoreItem).getByRole("button", { name: "Created 的更多操作" }));
    expect(await screen.findByRole("menuitem", { name: "导出 Created" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "编辑 Created" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "删除 Created" })).toBeTruthy();
  });
});

describe("SheetLibrary no-results state", () => {
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
