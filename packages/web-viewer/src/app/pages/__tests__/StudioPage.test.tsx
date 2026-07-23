// @vitest-environment jsdom

import type { ReactElement } from "react";
import { cleanup, render as testingRender, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AppStoreProvider } from "../../appStore";
import { StudioPage } from "../StudioPage";

afterEach(() => cleanup());

function render(element: ReactElement) {
  return testingRender(<AppStoreProvider>{element}</AppStoreProvider>);
}

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
    expect(screen.getByRole("heading", { level: 1, name: "和弦分析" })).toBeTruthy();
    expect(screen.queryByText("Harmony Analysis")).toBeNull();
    expect(screen.queryByText("等待曲谱加载")).toBeNull();
    expect(screen.getByRole("region", { name: "乐谱工作区" }).className).not.toMatch(/compact/i);
    expect(screen.queryByText(/Library Score:|score-1/)).toBeNull();
    expect(screen.getByRole("heading", { name: "未打开乐谱" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "撤销修正" })).toBeNull();
    expect(screen.queryByText(/session/i)).toBeNull();
  });

  it.each([
    ["ready", "0 个片段 · 0 个修正 · 已保存"],
    ["unsaved", "0 个片段 · 0 个修正 · 修正尚未保存"],
    ["saving", "正在保存 · 0 个片段 · 0 个修正"],
    ["analyzing", "正在重新分析 · 0 个片段 · 0 个修正"],
    ["conflict", "保存冲突 · 0 个片段 · 0 个修正 · 修正尚未保存"],
    ["error", "处理失败 · 0 个片段 · 0 个修正 · 修正尚未保存"],
  ] as const)("summarizes the %s Studio document state once", (status, expected) => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status,
        ...(status === "conflict" || status === "error"
          ? {
              error: {
                code: status === "conflict" ? ("studio-version-conflict" as const) : ("studio-save-failed" as const),
                recoverable: true,
              },
            }
          : {}),
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status", { name: "分析文档状态" }).textContent).toBe(expected);
  });

  it("does not expose the missing-score heading after the score session is active", () => {
    const snapshot = {
      currentLibraryScoreId: "score-1",
      studio: { libraryScoreId: "score-1", status: "loading" },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      getCurrentStudioSession: () => ({}),
      openStudio: async () => undefined,
      setStudioPreviewEnabled: () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "未打开乐谱" })).toBeNull();
  });

  it("keeps the Studio document visible while an autosave is pending", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "unsaved",
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
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
    expect(screen.getByRole("button", { name: "片段试听" })).toBeTruthy();
  });

  it("keeps the previous document visible during reanalysis", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "analyzing",
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
        },
      },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
      cancelStudioReanalysis: () => undefined,
      flushStudio: async () => undefined,
      undoStudio: () => undefined,
      redoStudio: () => undefined,
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/正在重新分析/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消分析" })).toBeTruthy();
  });

  it("reports a completed annotated-score export", async () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
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
    const analysisControls = within(view.container).getByRole("group", { name: "分析控制" });
    await user.click(within(analysisControls).getByRole("button", { name: "导出标注曲谱" }));
    expect(await within(view.container).findByText("已导出标注曲谱")).toBeTruthy();
    expect(within(view.container).queryByRole("contentinfo")).toBeNull();
  });

  it("selects any analysis segment instead of pinning the inspector to the first segment", async () => {
    const selectStudioRange = vi.fn();
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        availableTrackIds: ["track-1", "track-2"],
        document: {
          activeRevision: {
            parameters: { scope: { includedTrackIds: ["track-1"] } },
            segments: [
              {
                status: "unresolved",
                range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
                alternatives: [],
                reason: "low-confidence",
              },
              {
                status: "unresolved",
                range: { start: { measureIndex: 1, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 1 } },
                alternatives: [],
                reason: "low-confidence",
              },
            ],
          },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
      exportStudio: async () => "saved" as const,
      setStudioCorrection: async () => undefined,
      resetStudioCorrection: async () => undefined,
      selectStudioRange,
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(within(view.container).getByRole("button", { name: "分析设置" }));
    expect(screen.getByRole("option", { name: "track-2" })).toBeTruthy();
    const segments = within(view.container).getByRole("list", { name: "分析片段" });
    await user.click(within(segments).getByRole("button", { name: "片段 1" }));
    await user.keyboard("{ArrowDown}");
    expect(selectStudioRange).toHaveBeenLastCalledWith("score-1", {
      start: { measureIndex: 1, offsetTicks: 0 },
      end: { measureIndex: 1, offsetTicks: 1 },
    });
    await user.click(within(segments).getByRole("button", { name: "片段 2" }));
    expect(within(segments).getByRole("button", { name: "片段 2" }).getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(within(view.container).getByRole("region", { name: "和弦编辑器" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(within(segments).getByRole("button", { name: "片段 2" }));
    await user.click(within(view.container).getByRole("button", { name: "已修正" }));
    expect(within(view.container).getByRole("status", { name: "筛选选择说明" }).textContent).toContain(
      "当前选择不符合筛选条件，已临时显示",
    );
  });

  it("explains an uncovered score position without changing the current range", () => {
    const selectedRange = {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 4 },
    };
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        selection: { focus: selectedRange.start, range: selectedRange },
        selectionNotice: "no-effective-range",
        document: {
          activeRevision: {
            parameters: { scope: { includedTrackIds: ["track-1"] } },
            segments: [
              {
                status: "unresolved",
                range: selectedRange,
                alternatives: [],
                reason: "low-confidence",
              },
            ],
          },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
        },
      },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
      setStudioPreviewEnabled: () => undefined,
      undoStudio: () => undefined,
      redoStudio: () => undefined,
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
    } as never;

    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status", { name: "谱面选择说明" }).textContent).toContain("没有有效和弦区间");
    expect(screen.getByRole("list", { name: "分析片段" }).querySelector('[aria-pressed="true"]')).toBeTruthy();
  });

  it("keeps preview transport local to Studio", async () => {
    const playViewer = vi.fn();
    const toggleStudioPreview = vi.fn();
    const setStudioPreviewLoop = vi.fn();
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        transport: { status: "playing", positionTicks: 0, speed: 1 },
        audioStatus: "loading",
        selection: {
          focus: { measureIndex: 0, offsetTicks: 0 },
          range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
        },
        document: {
          activeRevision: {
            parameters: { scope: { includedTrackIds: ["track-1"] } },
            segments: [
              {
                status: "unresolved",
                range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
                alternatives: [],
                reason: "low-confidence",
              },
            ],
          },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
      toggleStudioPreview,
      setStudioPreviewLoop,
      playback: { play: playViewer },
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(within(view.container).getByRole("button", { name: "片段试听" }));
    await user.click(screen.getByRole("button", { name: "暂停预览" }));
    await user.click(screen.getByRole("button", { name: "循环选中片段" }));
    expect(screen.getByText("预览播放中")).toBeTruthy();
    expect(screen.getByText("音频加载中")).toBeTruthy();
    expect(toggleStudioPreview).toHaveBeenCalledWith("score-1");
    expect(setStudioPreviewLoop).toHaveBeenCalledWith("score-1", expect.anything());
    expect(playViewer).not.toHaveBeenCalled();
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

  it("shows analysis errors and CAS conflicts as accessible alerts", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "error" as const,
        error: { code: "studio-analysis-failed", recoverable: true },
      },
    };
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(within(view.container).getByRole("alert").textContent).toContain("分析失败");
  });

  it("blocks leaving with unsaved work and reports a CAS conflict", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "conflict",
        error: { code: "studio-version-conflict", recoverable: true },
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
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
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(within(view.container).getByRole("alert").textContent).toContain("版本冲突");
    const conflictUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(conflictUnload);
    expect(conflictUnload.defaultPrevented).toBe(true);

    view.unmount();
    const unsavedSnapshot = { ...snapshot, studio: { ...snapshot.studio, status: "unsaved" as const } };
    const unsavedApplication = {
      getSnapshot: () => unsavedSnapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={unsavedApplication} />} />
        </Routes>
      </MemoryRouter>,
    );
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("blocks leaving after a save failure keeps the edited document local", () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "error" as const,
        error: { code: "studio-save-failed", recoverable: true },
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
        },
      },
    };
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

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("keeps primary Studio controls keyboard reachable", async () => {
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
        document: {
          activeRevision: { segments: [], parameters: { scope: { includedTrackIds: ["track-1"] } } },
          corrections: [],
          annotationTarget: { trackId: "track-1", staffIndex: 0 },
        },
      },
    };
    const flushStudio = vi.fn(async () => undefined);
    const application = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      hasHarmonyAnalysisStorage: () => true,
      openStudio: async () => undefined,
      undoStudio: () => undefined,
      redoStudio: () => undefined,
      setStudioScope: async () => undefined,
      setStudioAnnotationTarget: async () => undefined,
      flushStudio,
    } as never;
    render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("缩小谱面");
    await user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("放大谱面");
    await user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("放大乐谱预览");
    await user.tab();
    expect(document.activeElement?.getAttribute("role")).toBe("separator");
    await user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("撤销修正");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    expect(flushStudio).toHaveBeenCalledWith("score-1");
  });
});
