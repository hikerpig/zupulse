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

  it("shows input kind and page count once metadata is available", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    expect(screen.getByText("4 KiB · PDF")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "开始提取" }));
    port.setSnapshot({ ...runningSnapshot, status: "succeeded", stage: "export" });
    port.emit({ schemaVersion: "1.0.0", sequence: 4, kind: "terminal", status: "succeeded" });

    expect(await screen.findByText(/PDF · 1 页/)).toBeTruthy();
    expect(await screen.findByText(/识别完成，可以预览、导出 MXL 或应用 MIDI 修正。/)).toBeTruthy();
  });

  it("shows the running stage in the status summary", async () => {
    const port = createPort();
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));

    expect(await screen.findByText("当前阶段 · 识谱")).toBeTruthy();
  });

  it("tiers unavailable engines and links them to settings", async () => {
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

    const link = screen.getByRole("link", { name: "在设置中配置" });
    expect(link.getAttribute("href")).toBe("#/settings");
    expect(link.closest("li")?.getAttribute("data-tier")).toBe("unconfigured");
  });

  it("sorts diagnostics by severity and folds entries beyond six", async () => {
    const port = createPort();
    port.readResult.mockResolvedValue({
      fileName: "score.mxl",
      bytes: new Uint8Array([1, 2, 3]),
      outputSha256: "a".repeat(64),
      validation: {
        readiness: { harmony: "ready" as const, musicXml: "ready" as const },
        diagnostics: [
          { code: "MISSING_EVENT_TIMING", severity: "warning" as const },
          ...Array.from({ length: 6 }, (_, index) => ({
            code: index % 2 === 0 ? "VOICE_DURATION_MISMATCH" : "MISSING_CLEF",
            severity: "blocking" as const,
          })),
        ],
      },
    });
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

    expect((await screen.findAllByText("声部总时值与拍号不一致。")).length).toBeGreaterThanOrEqual(1);
    const more = screen.getByText("展开其余 1 条").closest("details");
    expect(more).not.toBeNull();
    expect(more?.hasAttribute("open")).toBe(false);
    expect(more?.textContent).toContain("部分音符缺少时间信息");
    await user.click(screen.getByText("展开其余 1 条"));
    expect(more?.hasAttribute("open")).toBe(true);
  });

  it("offers a next-file action and a validation summary after success", async () => {
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

    expect(await screen.findByText("0 阻塞 · 0 警告")).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "识别下一份" }));
    expect(port.select).toHaveBeenCalledTimes(2);
  });

  it("renders the original input preview with paging once a job exists", async () => {
    const port = createPort();
    port.readInputPreview.mockImplementation(async (_jobId, pageIndex) => ({
      pageIndex,
      pageCount: 2,
      contentType: "image/png" as const,
      bytes: new Uint8Array([137, 80, 78, 71]),
    }));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    await user.click(screen.getByRole("tab", { name: "原始输入" }));

    const image = await screen.findByRole("img", { name: "sonata.pdf 第 1 页" });
    expect(image.getAttribute("src")).toBe("blob:preview");
    expect(screen.getByText("第 1 / 2 页")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第 2 / 2 页")).toBeTruthy();
    expect(port.readInputPreview).toHaveBeenLastCalledWith("job-1", 1);
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

    expect(await screen.findByText("声部总时值与拍号不一致。")).toBeTruthy();
    expect(screen.getByText("部分音符缺少时间信息，已按上下文推断。")).toBeTruthy();
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

    expect(await screen.findByText(/超过了引擎的尺寸上限/)).toBeTruthy();
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

    expect((await screen.findAllByText("sonata.pdf")).length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByText("当前引擎不可用或未配置。")).toBeTruthy();
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

    const engineSelect = await screen.findByRole("combobox", { name: "识谱引擎" });
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

  it("restores the exported state when reopening the workbench", async () => {
    const port = createPort();
    port.setSnapshot({ ...runningSnapshot, status: "succeeded", stage: "export", exported: true });

    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} />
      </I18nextProvider>,
    );

    expect(await screen.findByRole("button", { name: "已导出 MXL" })).toBeTruthy();
    expect(screen.getByText("已导出")).toBeTruthy();
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

  it("shows remote reconnection state and lets the user refresh immediately", async () => {
    const port = createPort();
    port.setSnapshot(runningSnapshot);
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} remote />
      </I18nextProvider>,
    );

    port.emitConnection("reconnecting");
    expect(await screen.findByText("实时连接已中断，正在自动重连。任务仍会在服务器继续运行。")).toBeTruthy();
    const callsBeforeRefresh = port.getDetail.mock.calls.length;
    await userEvent.setup().click(screen.getByRole("button", { name: "立即刷新" }));
    await waitFor(() => expect(port.getDetail).toHaveBeenCalledTimes(callsBeforeRefresh + 1));
  });

  it("renders the attempt timeline for a remote job", async () => {
    const port = createPort();
    port.setSnapshot({ ...runningSnapshot, status: "failed", error: { code: "ENGINE_FAILED", recoverable: true } });
    port.getDetail.mockResolvedValue({
      snapshot: { ...runningSnapshot, status: "failed", error: { code: "ENGINE_FAILED", recoverable: true } },
      attempts: [
        {
          attemptId: "attempt-1",
          attemptNumber: 1,
          status: "failed",
          engineId: "audiveris",
          errorCode: "ENGINE_FAILED",
          createdAt: "2026-08-16T00:00:00.000Z",
          startedAt: "2026-08-16T00:00:01.000Z",
          finishedAt: "2026-08-16T00:00:05.000Z",
        },
        {
          attemptId: "attempt-2",
          attemptNumber: 2,
          status: "running",
          engineId: "audiveris",
          stage: "recognize",
          createdAt: "2026-08-16T00:01:00.000Z",
          startedAt: "2026-08-16T00:01:01.000Z",
        },
      ],
    });
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} remote />
      </I18nextProvider>,
    );

    expect(await screen.findByRole("heading", { name: "尝试记录" })).toBeTruthy();
    expect(screen.getByText("第 1 次 · 失败")).toBeTruthy();
    expect(screen.getByText("错误码 · ENGINE_FAILED")).toBeTruthy();
    expect(screen.getByText("第 2 次 · 识别中")).toBeTruthy();
  });

  it("cancels a remote upload without reporting a start failure", async () => {
    const port = createPort();
    let rejectUpload: ((reason: Error) => void) | undefined;
    port.start.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectUpload = reject;
        }),
    );
    port.cancelPendingStart.mockImplementation(() => rejectUpload?.(new Error("UPLOAD_CANCELLED")));
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} remote />
      </I18nextProvider>,
    );
    await user.click(screen.getByRole("button", { name: "选择 PDF 或图片" }));
    await user.click(screen.getByRole("button", { name: "开始提取" }));
    expect(screen.getByText("正在上传输入文件…")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "取消上传" }));

    expect(port.cancelPendingStart).toHaveBeenCalledOnce();
    expect(await screen.findByText("上传已取消，未创建识谱任务。")).toBeTruthy();
    expect(screen.queryByText("无法启动识谱任务，请检查引擎配置后重试。")).toBeNull();
  });

  it("turns remote API failures into safe recovery guidance", async () => {
    const port = createPort();
    port.getDetail.mockRejectedValue(new Error("JOB_NOT_FOUND"));
    render(
      <I18nextProvider i18n={createAppI18n("zh-CN")}>
        <PdfOmrPage port={port} remote />
      </I18nextProvider>,
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "此识谱任务不存在或已过期。请返回识谱历史查看现有任务。",
    );
    expect(screen.queryByText("JOB_NOT_FOUND")).toBeNull();
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
  emitConnection(state: "connecting" | "connected" | "reconnecting"): void;
  setSnapshot(snapshot: PdfOmrJobSnapshot): void;
  getDetail: ReturnType<typeof vi.fn>;
  cancelPendingStart: ReturnType<typeof vi.fn>;
} {
  let snapshot: PdfOmrJobSnapshot | null = null;
  const listeners = new Set<(snapshot: PdfOmrJobSnapshot) => void>();
  const connectionListeners = new Set<(state: "connecting" | "connected" | "reconnecting") => void>();
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
    cancelPendingStart: vi.fn(),
    getSnapshot: vi.fn(async () => snapshot),
    getDetail: vi.fn(async () => (snapshot === null ? null : { snapshot, attempts: [] })),
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
    readInputPreview: vi.fn(async () => null),
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
    subscribe(listener: (snapshot: PdfOmrJobSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeConnection(listener: (state: "connecting" | "connected" | "reconnecting") => void) {
      connectionListeners.add(listener);
      listener("connected");
      return () => connectionListeners.delete(listener);
    },
    emit(event: PdfOmrProgressEvent) {
      if (snapshot === null) return;
      snapshot = {
        ...snapshot,
        ...(event.kind === "stage" ? { stage: event.stage, progress: event } : {}),
        ...(event.kind === "terminal" ? { status: event.status } : {}),
      };
      listeners.forEach((listener) => listener(snapshot!));
    },
    emitConnection(state: "connecting" | "connected" | "reconnecting") {
      connectionListeners.forEach((listener) => listener(state));
    },
    setSnapshot(next: PdfOmrJobSnapshot) {
      snapshot = next;
    },
  } satisfies PdfOmrWorkbenchPort & {
    emit(event: PdfOmrProgressEvent): void;
    emitConnection(state: "connecting" | "connected" | "reconnecting"): void;
    setSnapshot(next: PdfOmrJobSnapshot): void;
  };
  return port;
}
