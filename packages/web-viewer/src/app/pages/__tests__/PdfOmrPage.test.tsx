// @vitest-environment jsdom
import { I18nextProvider } from "react-i18next";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@zupulse/app-i18n";
import type { PdfOmrJobSnapshot, PdfOmrProgressEvent } from "@zupulse/web-core";
import { PdfOmrPage } from "../PdfOmrPage";
import type { PdfOmrWorkbenchPort } from "../../../features/pdf-omr/pdf-omr-port";

afterEach(cleanup);

describe("PdfOmrPage", () => {
  it("shows ready status once an input file is selected", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    expect(screen.getByText("等待选择输入")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    expect(await screen.findByText("可以开始")).toBeTruthy();
  });

  it("explains a segmentation failure with stage, advice, and skipped later stages", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      stage: "recognize",
      error: { code: "ENGINE_OUTPUT_INVALID", recoverable: true, reason: "ambiguous-system-segmentation" },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_OUTPUT_INVALID",
    });

    expect(await screen.findByText(/无法确定这份乐谱的谱表系统分割/)).toBeTruthy();
    expect(screen.getByText("失败阶段 · 识谱")).toBeTruthy();
    expect(screen.getByText(/同样的输入重试通常会再次失败/)).toBeTruthy();
    expect(screen.getAllByText("已跳过")).toHaveLength(2);
  });

  it("shows an ETA while recognition progresses", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      progress: { unit: "page", completed: 2, total: 5 },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 2,
      kind: "engine-progress",
      stage: "recognize",
      unit: "page",
      completed: 2,
      total: 5,
    });

    expect((await screen.findAllByText(/预计还需 0:0\d/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("progressbar")).toHaveProperty("ariaValueNow", "2");
  });

  it("shows per-stage durations after the job succeeds", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      status: "succeeded",
      stage: "export",
      engine: { id: "audiveris", version: "1.0.0" },
    });
    port.emit({ schemaVersion: "1.0.0", sequence: 4, kind: "terminal", status: "succeeded" });

    expect((await screen.findAllByText(/用时 0:0\d/)).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps PDF recognition session-scoped and exposes the real run stages", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    expect(screen.getAllByText("sonata.pdf").length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    expect(port.start).toHaveBeenCalledWith("file-token", "audiveris");
    expect(screen.getByRole("tab", { name: "中间证据" }).getAttribute("aria-selected")).toBe("true");
    await screen.getByRole("tab", { name: "中间证据" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "原始输入" }).getAttribute("aria-selected")).toBe("true");

    port.setSnapshot({
      ...runningSnapshot,
      status: "succeeded",
      stage: "export",
      engine: { id: "audiveris", version: "1.0.0" },
    });
    port.emit({ schemaVersion: "1.0.0", sequence: 4, kind: "terminal", status: "succeeded" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "提取乐谱" }).getAttribute("aria-selected")).toBe("true"),
    );
    expect(screen.getByText("MusicXML")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "导出 MXL" }));
    expect(port.exportResult).toHaveBeenCalledWith("job-1");
    expect(screen.getByRole("button", { name: "已导出 MXL" })).toBeTruthy();
  });

  it("cancels and retries without touching Library dependencies", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    await user.click(screen.getByRole("button", { name: "取消处理" }));
    expect(port.cancel).toHaveBeenCalledWith("job-1");

    port.setSnapshot({ ...runningSnapshot, status: "cancelled" });
    port.emit({ schemaVersion: "1.0.0", sequence: 5, kind: "terminal", status: "cancelled" });
    await waitFor(() => expect(screen.getByRole("button", { name: "重试" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.retry).toHaveBeenCalledWith("job-1", "audiveris");
  });

  it("shows blocking draft diagnostics when validation fails", async () => {
    const port = createPort();
    port.readFailedValidation.mockResolvedValue({
      readiness: { harmony: "blocked", musicXml: "blocked" },
      diagnostics: [
        { code: "VOICE_DURATION_MISMATCH", severity: "blocking" },
        { code: "MISSING_EVENT_TIMING", severity: "warning" },
      ],
    });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "DRAFT_VALIDATION_FAILED", recoverable: true },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "DRAFT_VALIDATION_FAILED",
    });

    expect(await screen.findByText("VOICE_DURATION_MISMATCH")).toBeTruthy();
    expect(screen.getByText("MISSING_EVENT_TIMING")).toBeTruthy();
    expect(screen.getAllByText("阻塞").length).toBeGreaterThanOrEqual(2);
    expect(port.readFailedValidation).toHaveBeenCalledWith("job-1");
  });

  it("shows a specific reason when the engine rejects an oversized scan", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "INVALID_INPUT", recoverable: true, reason: "input-image-too-large" },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "INVALID_INPUT",
    });

    expect(await screen.findByText(/超过了 engine 的尺寸上限/)).toBeTruthy();
    expect(screen.getByText(/INVALID_INPUT/)).toBeTruthy();
  });

  it("keeps the failed snapshot retryable when retry cannot start", async () => {
    const port = createPort();
    port.retry.mockRejectedValueOnce(new Error("provider unavailable"));
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "ENGINE_UNAVAILABLE", recoverable: false },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_UNAVAILABLE",
    });

    await user.click(await screen.findByRole("button", { name: "重试" }));

    expect(await screen.findByRole("button", { name: "重试" })).toBeTruthy();
    expect(screen.getByText(/ENGINE_UNAVAILABLE/)).toBeTruthy();
  });

  it("restores failed input metadata and retry after remount", async () => {
    const port = createPort();
    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "ENGINE_EXECUTION_FAILED", recoverable: true },
    });
    const user = userEvent.setup();

    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    expect(await screen.findByText("sonata.pdf")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(port.retry).toHaveBeenCalledWith("job-1", "audiveris");
  });

  it("shows live engine progress and elapsed time on the active stage", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    expect(await screen.findByText(/已用时 0:0\d/)).toBeTruthy();

    port.setSnapshot({
      ...runningSnapshot,
      progress: { unit: "page", completed: 2, total: 5 },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 2,
      kind: "engine-progress",
      stage: "recognize",
      unit: "page",
      completed: 2,
      total: 5,
    });

    expect(await screen.findByText(/页 2 \/ 5 · 已用时 0:0\d/)).toBeTruthy();
  });

  it("keeps the active input fixed while recognition is running", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    const selectInput = screen.getByRole("button", { name: "选择 PDF 或图片" });
    await user.click(selectInput);
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    expect(selectInput).toHaveProperty("disabled", true);
  });

  it("skips disabled evidence tabs during keyboard navigation", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    const inputTab = screen.getByRole("tab", { name: "原始输入" });
    inputTab.focus();

    await user.keyboard("{ArrowRight}");

    expect(inputTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(inputTab);
  });

  it("shows the failure reason and makes retry available after an engine error", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "ENGINE_UNAVAILABLE", recoverable: false },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_UNAVAILABLE",
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "重试" })).toBeTruthy());
    expect(screen.getByText("识别失败")).toBeTruthy();
    expect(screen.getByText(/ENGINE_UNAVAILABLE/)).toBeTruthy();
    expect(screen.getByText("当前 engine 不可用或未配置。")).toBeTruthy();
  });

  it("allows selecting another engine before retrying a failed job", async () => {
    const port = createPort();
    port.engines = [
      { id: "audiveris", version: "1.0.0", label: "Audiveris", available: true, inputKinds: ["pdf", "image"] },
      { id: "rokot", version: "1.0.0", label: "Rokot", available: true, inputKinds: ["pdf"] },
    ];
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    port.setSnapshot({
      ...runningSnapshot,
      status: "failed",
      error: { code: "ENGINE_UNAVAILABLE", recoverable: false },
    });
    port.emit({
      schemaVersion: "1.0.0",
      sequence: 6,
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_UNAVAILABLE",
    });

    const engineSelect = await screen.findByRole("combobox", { name: "识谱 engine" });
    expect(engineSelect).toHaveProperty("disabled", false);
    await user.selectOptions(engineSelect, "rokot");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(port.retry).toHaveBeenCalledWith("job-1", "rokot");
  });

  it("selects an image-capable engine for PNG input and disables PDF-only engines", async () => {
    const port = createPort();
    port.engines = [
      { id: "rokot", version: "1.0.0", label: "Rokot", available: true, inputKinds: ["pdf"] },
      { id: "audiveris", version: "1.0.0", label: "Audiveris", available: true, inputKinds: ["pdf", "image"] },
    ];
    port.select.mockResolvedValueOnce({
      status: "selected",
      fileToken: "image-token",
      fileName: "sonata.png",
      sizeBytes: 4096,
      inputKind: "image",
    });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    expect(screen.getByRole("option", { name: /Rokot/ })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    expect(port.start).toHaveBeenCalledWith("image-token", "audiveris");
  });

  it("explains engine preflight results before the user starts recognition", async () => {
    const port = createPort();
    port.engines = [
      { id: "audiveris", version: "5.11.0", label: "Audiveris", available: true, inputKinds: ["pdf", "image"] },
      {
        id: "rokot",
        version: "unknown",
        label: "Rokot",
        available: false,
        inputKinds: ["pdf"],
        reason: "missing-rokot-configuration",
      },
    ];

    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    expect(screen.getByText("已就绪 · 5.11.0")).toBeTruthy();
    expect(screen.getByText("需要配置 llama.cpp、Rokot 模型、vision projector 和 ABC 转换器。")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Rokot/ })).toHaveProperty("disabled", true);
  });

  it("analyzes score-export MIDI and applies only an explicitly selected written pitch", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    port.setSnapshot({ ...runningSnapshot, status: "succeeded", stage: "export" });
    port.emit({ schemaVersion: "1.0.0", sequence: 4, kind: "terminal", status: "succeeded" });
    await screen.findByRole("button", { name: "选择 MIDI 并分析" });

    await user.click(screen.getByRole("button", { name: "选择 MIDI 并分析" }));
    expect(port.analyzeMidi).toHaveBeenCalledWith("job-1", "midi-token");
    expect(await screen.findByText("兼容")).toBeTruthy();
    expect(screen.getByText("音高一致率 75%")).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "第 1 小节的书面音高" }), "C:1:4");
    await user.click(screen.getByRole("button", { name: "应用 1 项修正" }));
    expect(port.applyMidiCorrections).toHaveBeenCalledWith("job-1", [
      { proposalId: "proposal-1", writtenPitch: { step: "C", alter: 1, octave: 4 } },
    ]);
    expect(await screen.findByText("已生成 MIDI 修正版 MXL")).toBeTruthy();
  });

  it("restores a succeeded result when reopening the workbench", async () => {
    const port = createPort();
    port.setSnapshot({ ...runningSnapshot, status: "succeeded", stage: "export" });

    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    expect(await screen.findByText("MusicXML")).toBeTruthy();
    expect(port.readResult).toHaveBeenCalledWith("job-1");
    expect(screen.getByRole("button", { name: "选择 MIDI 并分析" })).toBeTruthy();
  });
});

const runningSnapshot: PdfOmrJobSnapshot = {
  jobId: "job-1",
  status: "running",
  stage: "recognize",
  input: { fileName: "sonata.pdf", sizeBytes: 4096, inputKind: "pdf", pageCount: 1 },
};

function createPort(): PdfOmrWorkbenchPort & {
  emit(event: PdfOmrProgressEvent): void;
  setSnapshot(snapshot: PdfOmrJobSnapshot): void;
} {
  let snapshot: PdfOmrJobSnapshot | null = null;
  const listeners = new Set<(jobId: string, event: PdfOmrProgressEvent) => void>();
  const port = {
    engines: [{ id: "audiveris", version: "1.0.0", label: "Audiveris", available: true, inputKinds: ["pdf", "image"] }],
    select: vi.fn(async () => ({
      status: "selected" as const,
      fileToken: "file-token",
      fileName: "sonata.pdf",
      sizeBytes: 4096,
      inputKind: "pdf",
    })),
    start: vi.fn(async () => {
      snapshot = runningSnapshot;
      return { jobId: "job-1", snapshot: runningSnapshot };
    }),
    retry: vi.fn(async () => {
      snapshot = runningSnapshot;
      return { jobId: "job-1", snapshot: runningSnapshot };
    }),
    cancel: vi.fn(async () => undefined),
    getSnapshot: vi.fn(async () => snapshot),
    readResult: vi.fn(async () => ({
      fileName: "score.mxl",
      bytes: new Uint8Array([1, 2, 3]),
      outputSha256: "a".repeat(64),
      validation: {
        readiness: { harmony: "ready" as const, musicXml: "ready" as const },
        diagnostics: [],
      },
    })),
    readFailedValidation: vi.fn(async () => null),
    exportResult: vi.fn(async () => "saved" as const),
    selectMidi: vi.fn(async () => ({
      status: "selected" as const,
      fileToken: "midi-token",
      fileName: "reference.mid",
      sizeBytes: 512,
    })),
    analyzeMidi: vi.fn(async () => ({
      midiFileName: "reference.mid",
      compatibility: { status: "compatible" as const, scoreCoverage: 1, midiCoverage: 1, pitchAgreement: 0.75 },
      proposals: [
        {
          id: "proposal-1",
          type: "pitch-disagreement" as const,
          confidence: 0.9,
          reviewability: { status: "writeback-ready" as const, reasons: [] },
          measureIndex: 0,
          before: { step: "C" as const, alter: 0 as const, octave: 4 },
          suggestedSoundingMidi: 61,
        },
      ],
    })),
    applyMidiCorrections: vi.fn(async () => ({ appliedCount: 1 })),
    subscribe(listener: (jobId: string, event: PdfOmrProgressEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event: PdfOmrProgressEvent) {
      listeners.forEach((listener) => listener("job-1", event));
    },
    setSnapshot(next: PdfOmrJobSnapshot) {
      snapshot = next;
    },
  } satisfies PdfOmrWorkbenchPort & {
    emit(event: PdfOmrProgressEvent): void;
    setSnapshot(next: PdfOmrJobSnapshot): void;
  };
  return port;
}
