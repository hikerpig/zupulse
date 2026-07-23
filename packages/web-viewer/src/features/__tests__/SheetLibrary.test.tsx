// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("failed · INVALID_SCORE")).toBeTruthy();
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
