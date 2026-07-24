import { useEffect, useState, useSyncExternalStore, useRef } from "react";
import { useParams } from "react-router";
import { Undo2, Redo2, Settings, Volume2, Download } from "lucide-react";
import { createHarmonyRangeViewItems } from "../../features/harmony-studio/harmony-range-view-model";
import { HarmonyRangeWorkspace } from "../../features/harmony-studio/harmony-range-workspace";
import { HarmonyStudioEditor } from "../../features/harmony-studio/HarmonyStudioEditor";
import { ScoreViewer } from "../../components/ScoreViewer";
import { StudioSplitWorkspace } from "../../components/studio-split-workspace";
import { ContextPopup } from "../../components/ContextPopup";
import type { ViewerApplication, ViewerApplicationSnapshot } from "../ViewerApplication";
import type { ApplicationIssue } from "../applicationIssue";
import { loadStudioPreferences, saveStudioPreferences } from "../studio-preferences";
import styles from "./StudioPage.module.css";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function sameRange(
  left: { start: { measureIndex: number; offsetTicks: number }; end: { measureIndex: number; offsetTicks: number } },
  right: { start: { measureIndex: number; offsetTicks: number }; end: { measureIndex: number; offsetTicks: number } },
): boolean {
  return (
    left.start.measureIndex === right.start.measureIndex &&
    left.start.offsetTicks === right.start.offsetTicks &&
    left.end.measureIndex === right.end.measureIndex &&
    left.end.offsetTicks === right.end.offsetTicks
  );
}

function documentStatusLabel(
  status: NonNullable<ViewerApplicationSnapshot["studio"]>["status"],
  segmentCount: number,
  correctionCount: number,
): string {
  const counts = `${segmentCount} 个片段 · ${correctionCount} 个修正`;
  if (status === "saving") return `正在保存 · ${counts}`;
  if (status === "analyzing") return `正在重新分析 · ${counts}`;
  if (status === "unsaved") return `${counts} · 修正尚未保存`;
  if (status === "conflict") return `保存冲突 · ${counts} · 修正尚未保存`;
  if (status === "error") return `处理失败 · ${counts} · 修正尚未保存`;
  return `${counts} · 已保存`;
}

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { libraryScoreId } = useParams();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const active =
    libraryScoreId !== undefined &&
    snapshot.studio?.libraryScoreId === libraryScoreId &&
    application.getCurrentStudioSession?.() !== undefined;
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  const studio = snapshot.studio?.libraryScoreId === libraryScoreId ? snapshot.studio : undefined;
  const studioDocument = studio?.document;
  const includedTrackIds = studioDocument?.activeRevision.parameters.scope.includedTrackIds ?? [];
  const availableTrackIds = studio?.availableTrackIds ?? includedTrackIds;
  const ranges =
    studio?.ranges ??
    (studioDocument
      ? createHarmonyRangeViewItems(
          studioDocument.activeRevision.segments.map((segment) =>
            segment.status === "resolved"
              ? { type: "chord" as const, range: segment.range, chord: segment.chord, origin: "analysis" as const }
              : {
                  type: "unresolved" as const,
                  range: segment.range,
                  reason: segment.reason,
                  alternatives: segment.alternatives,
                  origin: "analysis" as const,
                },
          ),
          studioDocument.activeRevision.segments,
        )
      : []);
  const [fallbackSelectedKey, setFallbackSelectedKey] = useState<string>();
  const selectedRange = studio?.selection
    ? ranges.find((item) => sameRange(item.effective.range, studio.selection!.range))
    : ranges.find((item) => item.key === fallbackSelectedKey);
  const selectedSegment = selectedRange?.analysis;
  const [exportStatus, setExportStatus] = useState<string>();
  const selectRange = (item: (typeof ranges)[number]) => {
    setFallbackSelectedKey(item.key);
    application.selectStudioRange(libraryScoreId!, item.effective.range);
  };
  const [preferences, setPreferences] = useState(() => loadStudioPreferences(browserStorage()));
  const updatePreferences = (next: Partial<typeof preferences>) =>
    setPreferences((current) => {
      const updated = { ...current, ...next };
      saveStudioPreferences(browserStorage(), updated);
      return updated;
    });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const preview = studio?.transport ?? {
    status: "paused",
    positionTicks: 0,
    speed: 1,
  };
  const previewStatusLabel =
    preview.status === "playing" ? "预览播放中" : preview.status === "stopped" ? "预览已停止" : "预览已暂停";
  const audioStatusLabel =
    studio?.audioStatus === "loading"
      ? "音频加载中"
      : studio?.audioStatus === "ready"
        ? "音频已就绪"
        : studio?.audioStatus === "error"
          ? "音频加载失败"
          : studio?.audioStatus === "unavailable"
            ? "音频不可用"
            : undefined;
  useEffect(() => {
    if (libraryScoreId && storageAvailable) void application.openStudio(libraryScoreId);
  }, [application, libraryScoreId, storageAvailable]);
  useEffect(() => {
    if (libraryScoreId && active) application.setStudioPreviewEnabled(libraryScoreId, preferences.previewEnabled);
  }, [active, application, libraryScoreId, preferences.previewEnabled]);
  useEffect(() => {
    if (!libraryScoreId || !storageAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void application.flushStudio(libraryScoreId);
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasUnpersistedDocument =
        studio?.status === "unsaved" ||
        studio?.status === "saving" ||
        studio?.status === "conflict" ||
        (studio?.status === "error" && studio.document !== undefined && studio.document !== null);
      if (hasUnpersistedDocument) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [application, libraryScoreId, storageAvailable, studio?.status]);
  return (
    <main className={styles.studioShell} aria-label="和弦分析工作室">
      <StudioSplitWorkspace
        split={preferences.split}
        onSplitChange={(split) => updatePreferences({ split })}
        scoreClassName={styles.scorePane}
        analysisClassName={styles.analysisRegion}
        score={
          <>
            {!active ? (
              <h2 id="summary" className="sr-only">
                未打开乐谱
              </h2>
            ) : null}
            <ScoreViewer expandable />
          </>
        }
        analysis={
          <section aria-label="分析状态">
            <div className={styles.analysisHeading}>
              <div>
                <p className={styles.sectionKicker}>Chord workspace</p>
                <h1>和弦分析</h1>
                <p>选择片段并确认候选，或使用结构化字段精确修正。</p>
              </div>
            </div>
            {!storageAvailable ? (
              <p className={styles.alert} role="alert">
                和声分析存储不可用
              </p>
            ) : studio?.status === "loading" && !studioDocument ? (
              <p className={styles.emptyState} role="status">
                正在初始化和声分析…
              </p>
            ) : studio?.status === "error" && !studioDocument ? (
              <p className={styles.alert} role="alert">
                {studioIssueMessage(studio.error)}
              </p>
            ) : studioDocument ? (
              <>
                <div className={styles.commandBar}>
                  <div className={styles.documentStatus}>
                    <p role="status" aria-label="分析文档状态">
                      {documentStatusLabel(
                        studio.status,
                        studioDocument.activeRevision.segments.length,
                        studioDocument.corrections.length,
                      )}
                    </p>
                  </div>
                  <div className={styles.commandGroups}>
                    <div className={styles.buttonGroup} role="group" aria-label="修正历史">
                      <button
                        type="button"
                        onClick={() => application.undoStudio(libraryScoreId!)}
                        aria-label="撤销修正"
                        title="撤销修正"
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => application.redoStudio(libraryScoreId!)}
                        aria-label="重做修正"
                        title="重做修正"
                      >
                        <Redo2 size={16} />
                      </button>
                    </div>
                    <div className={styles.buttonGroup} role="group" aria-label="分析控制">
                      {studio.status === "analyzing" ? (
                        <button type="button" onClick={() => application.cancelStudioReanalysis(libraryScoreId!)}>
                          取消分析
                        </button>
                      ) : (
                        <button type="button" onClick={() => void application.reanalyzeStudio(libraryScoreId!)}>
                          重新分析
                        </button>
                      )}
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void application.flushStudio(libraryScoreId!)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void application
                            .exportStudio(libraryScoreId!)
                            .then((result) => setExportStatus(result === "saved" ? "已导出标注曲谱" : "已取消导出"))
                            .catch((error: unknown) =>
                              setExportStatus(error instanceof Error ? error.message : "导出失败"),
                            )
                        }
                        aria-label="导出标注曲谱"
                        title="导出标注曲谱"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                    <div className={styles.buttonGroup} role="group" aria-label="设置与预览">
                      <button
                        ref={settingsButtonRef}
                        type="button"
                        onClick={() => {
                          setSettingsOpen(!settingsOpen);
                          setPreviewOpen(false);
                        }}
                        aria-label="分析设置"
                        title="分析设置"
                      >
                        <Settings size={16} />
                      </button>
                      <button
                        ref={previewButtonRef}
                        type="button"
                        onClick={() => {
                          setPreviewOpen(!previewOpen);
                          setSettingsOpen(false);
                        }}
                        aria-label="片段试听"
                        title="片段试听"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                {exportStatus ? (
                  <p className={styles.exportStatus} role="status">
                    {exportStatus}
                  </p>
                ) : null}
                {studio.status === "conflict" || studio.status === "error" ? (
                  <p className={styles.alert} role="alert">
                    {studioIssueMessage(studio.error)}
                  </p>
                ) : null}
                {studio.previewError ? (
                  <p className={styles.alert} role="alert">
                    预览不可用：{studioIssueMessage(studio.previewError)}
                    <button
                      type="button"
                      onClick={() =>
                        (application as unknown as { retryStudioPreview?: (id: string) => void }).retryStudioPreview?.(
                          libraryScoreId!,
                        )
                      }
                    >
                      重试预览
                    </button>
                  </p>
                ) : null}
                {studio.audioError ? (
                  <p className={styles.alert} role="alert">
                    试听不可用：{studioIssueMessage(studio.audioError)}
                  </p>
                ) : null}
                {studio.selectionNotice ? (
                  <p className={styles.emptyState} role="status" aria-label="谱面选择说明">
                    该位置没有有效和弦区间，已保留当前选择。
                  </p>
                ) : null}

                <ContextPopup anchor={settingsButtonRef.current} open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <div>
                    <p className={styles.sectionKicker}>SETTINGS</p>
                    <h3>分析设置</h3>
                    <details className={styles.popupSection} open={false}>
                      <summary>分析范围</summary>
                      <label className={styles.field}>
                        <select
                          multiple
                          aria-label="分析范围"
                          value={studioDocument.activeRevision.parameters.scope.includedTrackIds}
                          onChange={(event) =>
                            void application.setStudioScope(
                              libraryScoreId!,
                              Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                            )
                          }
                        >
                          {availableTrackIds.map((trackId) => (
                            <option key={trackId} value={trackId}>
                              {trackId}
                            </option>
                          ))}
                        </select>
                      </label>
                    </details>
                    <details className={styles.popupSection} open>
                      <summary>标注目标</summary>
                      <label className={styles.field}>
                        <select
                          aria-label="标注目标"
                          value={studioDocument.annotationTarget.trackId}
                          onChange={(event) =>
                            void application.setStudioAnnotationTarget(libraryScoreId!, {
                              trackId: event.currentTarget.value,
                              staffIndex: studioDocument.annotationTarget.staffIndex,
                            })
                          }
                        >
                          {includedTrackIds.map((trackId) => (
                            <option key={trackId} value={trackId}>
                              {trackId}
                            </option>
                          ))}
                        </select>
                      </label>
                    </details>
                  </div>
                </ContextPopup>

                <ContextPopup anchor={previewButtonRef.current} open={previewOpen} onOpenChange={setPreviewOpen}>
                  <div>
                    <p className={styles.sectionKicker}>PREVIEW</p>
                    <h3>片段试听</h3>
                    <p role="status">{previewStatusLabel}</p>
                    {audioStatusLabel ? <p role="status">{audioStatusLabel}</p> : null}
                    <button
                      type="button"
                      onClick={() => updatePreferences({ previewEnabled: !preferences.previewEnabled })}
                    >
                      {preferences.previewEnabled ? "隐藏和弦预览" : "显示和弦预览"}
                    </button>
                    <div className={styles.previewControls}>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          application.toggleStudioPreview(libraryScoreId!);
                        }}
                      >
                        {preview.status === "playing" ? "暂停预览" : "播放预览"}
                      </button>
                      <label className={`${styles.field} ${styles.positionField}`}>
                        <span>预览位置</span>
                        <input
                          type="range"
                          aria-label="预览位置"
                          min="0"
                          max="10000"
                          value={preview.positionTicks}
                          onChange={(event) => {
                            const positionTicks = Number(event.currentTarget.value);
                            application.setStudioPreviewPosition(libraryScoreId!, positionTicks);
                          }}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>速度</span>
                        <select
                          aria-label="预览速度"
                          value={preview.speed}
                          onChange={(event) => {
                            const speed = Number(event.currentTarget.value);
                            application.setStudioPreviewSpeed(libraryScoreId!, speed);
                          }}
                        >
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                            <option key={speed} value={speed}>
                              {speed}x
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!selectedRange}
                        onClick={() => {
                          application.setStudioPreviewLoop(
                            libraryScoreId!,
                            preview.loop ? undefined : selectedRange?.effective.range,
                          );
                        }}
                      >
                        {preview.loop ? "取消选中片段循环" : "循环选中片段"}
                      </button>
                    </div>
                  </div>
                </ContextPopup>

                <HarmonyRangeWorkspace
                  ranges={ranges}
                  {...(selectedRange ? { selectedKey: selectedRange.key } : {})}
                  onSelect={selectRange}
                  editor={
                    selectedRange ? (
                      <>
                        <HarmonyStudioEditor
                          candidates={selectedSegment?.alternatives ?? []}
                          {...(selectedSegment?.status === "unresolved"
                            ? { unresolvedReason: selectedSegment.reason }
                            : {})}
                          onSelect={(candidate) =>
                            void application.setStudioCorrection(libraryScoreId!, selectedRange.effective.range, {
                              type: "chord",
                              chord: candidate.chord,
                            })
                          }
                          onApply={(chord) =>
                            void application.setStudioCorrection(libraryScoreId!, selectedRange.effective.range, {
                              type: "chord",
                              chord,
                            })
                          }
                          onNoChord={() =>
                            void application.setStudioCorrection(libraryScoreId!, selectedRange.effective.range, {
                              type: "no-chord",
                            })
                          }
                        />
                        <div className={styles.segmentActions} aria-label="片段修正操作">
                          <button
                            type="button"
                            onClick={() =>
                              void application.resetStudioCorrection(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            重置选中片段
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.splitStudioCorrection(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            拆分选中修正
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.mergeStudioCorrections(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            合并相邻修正
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.moveStudioCorrection(libraryScoreId!, selectedRange.effective.range, -1)
                            }
                          >
                            修正左移
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.moveStudioCorrection(libraryScoreId!, selectedRange.effective.range, 1)
                            }
                          >
                            修正右移
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.emptyState}>当前分析没有可编辑片段。</p>
                    )
                  }
                />
              </>
            ) : (
              <p className={styles.emptyState}>首次分析、修正与导出将在此工作区完成。</p>
            )}
          </section>
        }
      />
    </main>
  );
}

function studioIssueMessage(issue: ApplicationIssue | undefined): string {
  switch (issue?.code) {
    case "studio-storage-unavailable":
      return "和声分析存储不可用";
    case "score-not-found":
      return "曲谱不存在";
    case "studio-format-unsupported":
      return "仅支持 MusicXML/MXL 曲谱";
    case "studio-runtime-unavailable":
      return "和弦工作室不可用";
    case "studio-analyzer-unavailable":
      return "MusicXML 分析器不可用";
    case "studio-no-analyzable-tracks":
      return "曲谱没有可分析的音高轨道";
    case "studio-version-conflict":
      return "版本冲突";
    case "studio-save-failed":
      return "保存失败";
    case "studio-preview-unavailable":
      return "无法在当前乐谱上显示和弦预览";
    case "studio-preview-failed":
      return "预览渲染失败";
    case "studio-audio-unavailable":
      return "当前环境无法播放预览";
    default:
      return "分析失败";
  }
}
