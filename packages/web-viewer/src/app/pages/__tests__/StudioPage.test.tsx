// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { StudioPage } from "../StudioPage";

afterEach(() => cleanup());

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
    expect(screen.queryByRole("button", { name: "撤销修正" })).toBeNull();
    expect(screen.queryByText(/session/i)).toBeNull();
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
    expect(screen.getByRole("button", { name: "播放预览" })).toBeTruthy();
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
    await user.click(within(view.container).getByRole("button", { name: "导出标注曲谱" }));
    expect(await within(view.container).findByText("已导出标注曲谱")).toBeTruthy();
  });

  it("selects any analysis segment instead of pinning the inspector to the first segment", async () => {
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
    } as never;
    const view = render(
      <MemoryRouter initialEntries={["/studio/score-1"]}>
        <Routes>
          <Route path="/studio/:libraryScoreId" element={<StudioPage application={application} />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(within(view.container).getByRole("option", { name: "track-2" })).toBeTruthy();
    const segments = within(view.container).getByRole("list", { name: "分析片段" });
    await user.click(within(segments).getByRole("button", { name: "片段 2" }));
    expect(within(segments).getByRole("button", { name: "片段 2" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps preview transport local to Studio", async () => {
    const playViewer = vi.fn();
    const snapshot = {
      studio: {
        libraryScoreId: "score-1",
        status: "ready",
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
    await user.click(within(view.container).getByRole("button", { name: "播放预览" }));
    await user.click(within(view.container).getByRole("button", { name: "循环选中片段" }));
    expect(within(view.container).getByText("预览播放中")).toBeTruthy();
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
        error: "分析失败",
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
        error: "版本冲突",
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
        error: "保存失败",
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
    expect(document.activeElement?.getAttribute("aria-label")).toBe("放大乐谱预览");
    await user.tab();
    expect(document.activeElement?.getAttribute("role")).toBe("separator");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("撤销修正");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    expect(flushStudio).toHaveBeenCalledWith("score-1");
  });
});
