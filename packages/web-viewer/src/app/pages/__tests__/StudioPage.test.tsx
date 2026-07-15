// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { StudioPage } from "../StudioPage";

describe("StudioPage", () => {
  it("renders a persistent library score route without exposing a session id", () => {
    const snapshot = { currentLibraryScoreId: "score-1" };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "和弦分析工作室" })).toBeTruthy();
    expect(screen.getByText("Library Score: score-1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回查看器" }).getAttribute("href")).toBe("/viewer/score-1");
    expect(screen.queryByRole("button", { name: "撤销修正" })).toBeNull();
    expect(screen.queryByText(/session/i)).toBeNull();
  });

  it("keeps the Studio document visible while an autosave is pending", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "unsaved",
        document: {
          activeRevision: { segments: [], parameters: {} },
          corrections: [],
        },
      },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
      undoStudio: () => undefined,
      redoStudio: () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/修正尚未保存/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "撤销修正" })).toBeTruthy();
  });

  it("reports a completed annotated-score export", async () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        document: { activeRevision: { segments: [], parameters: {} }, corrections: [] },
      },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
      undoStudio: () => undefined,
      redoStudio: () => undefined,
      exportStudio: async () => "saved" as const,
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(within(view.container).getByRole("button", { name: "导出标注曲谱" }));
    expect(await within(view.container).findByText("已导出标注曲谱")).toBeTruthy();
  });

  it("shows a storage-unavailable state instead of silently using memory", () => {
    const snapshot = {};
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => false,
      openStudio: async () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain("存储不可用");
  });
});
