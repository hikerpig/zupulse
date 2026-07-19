import { useEffect, useState, useSyncExternalStore } from "react";
import { useParams } from "react-router";
import { createHarmonyRangeViewItems } from "../../features/harmony-studio/harmony-range-view-model";
import { HarmonyRangeWorkspace } from "../../features/harmony-studio/harmony-range-workspace";
import { HarmonyStudioEditor } from "../../features/harmony-studio/HarmonyStudioEditor";
import { ScoreViewer } from "../../components/ScoreViewer";
import { StudioSplitWorkspace } from "../../components/studio-split-workspace";
import type { ViewerApplication } from "../ViewerApplication";
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
    <main className={styles.studioShell} aria-labelledby="studio-title">
      <div className={styles.contextBar}>
        <div className={styles.contextMain}>
          <p className={styles.appKicker}>Harmony Analysis</p>
          <h1 id="studio-title">和弦分析工作室</h1>
          <p>校对分析片段、编辑和弦，并将结果保存回曲谱。</p>
        </div>
        <div className={styles.contextActions}>
          <span id="status" className={styles.statusChip} role="status">
            {active ? "曲谱已加载" : "等待曲谱加载"}
          </span>
        </div>
      </div>
      <StudioSplitWorkspace
        split={preferences.split}
        onSplitChange={(split) => updatePreferences({ split })}
        scoreClassName={styles.scorePane}
        analysisClassName={styles.analysisRegion}
        score={
          <>
            <h2 id="summary" className="sr-only">
              未打开乐谱
            </h2>
            <ScoreViewer compact expandable />
          </>
        }
        analysis={
          <section aria-label="分析状态">
            <div className={styles.analysisHeading}>
              <div>
                <p className={styles.sectionKicker}>Chord workspace</p>
                <h2>和弦分析</h2>
                <p>选择片段并确认候选，或使用结构化字段精确修正。</p>
              </div>
              <p className={styles.scoreId}>{libraryScoreId ? `Library Score: ${libraryScoreId}` : "缺少曲谱 ID"}</p>
            </div>
            {!storageAvailable ? (
              <p className={styles.alert} role="alert">
                和声分析存储不可用
              </p>
            ) : studio?.status === "loading" && !studioDocument ? (
              <p className={styles.emptyState} role="status">
                正在初始化和声分析…
              </p>
            ) : studio?.status === "error" ? (
              <p className={styles.alert} role="alert">
                {studio.error}
              </p>
            ) : studioDocument ? (
              <>
                <div className={styles.commandBar}>
                  <div className={styles.documentStatus}>
                    <p role="status">
                      {studio.status === "analyzing"
                        ? "正在重新分析…"
                        : studio.status === "saving"
                          ? "正在保存修正…"
                          : studio.status === "unsaved"
                            ? "修正尚未保存"
                            : "已加载分析结果"}
                    </p>
                    <span>{studioDocument.activeRevision.segments.length} 个片段</span>
                    <span>
                      {studio.status === "ready" ? "已保存" : "待保存"} · {studioDocument.corrections.length} 个修正
                    </span>
                  </div>
                  <div className={styles.commandGroups}>
                    <div className={styles.buttonGroup} aria-label="修正历史">
                      <button type="button" onClick={() => application.undoStudio(libraryScoreId!)}>
                        撤销修正
                      </button>
                      <button type="button" onClick={() => application.redoStudio(libraryScoreId!)}>
                        重做修正
                      </button>
                    </div>
                    <div className={styles.buttonGroup} aria-label="分析控制">
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
                        立即保存
                      </button>
                    </div>
                  </div>
                </div>
                {studio.status === "conflict" ? (
                  <p className={styles.alert} role="alert">
                    {studio.error}
                  </p>
                ) : null}
                {studio.previewError ? (
                  <p className={styles.alert} role="alert">
                    预览不可用：{studio.previewError}
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
                    试听不可用：{studio.audioError}
                  </p>
                ) : null}
                {studio.selectionNotice ? (
                  <p className={styles.emptyState} role="status" aria-label="谱面选择说明">
                    {studio.selectionNotice}
                  </p>
                ) : null}

                <div className={styles.utilityGrid}>
                  <details className={styles.utilityPanel}>
                    <summary className={styles.panelHeading}>
                      <span>SETTINGS</span>
                      <h3 id="analysis-settings-title">分析设置</h3>
                    </summary>
                    <div className={styles.fieldGrid}>
                      <label className={styles.field}>
                        <span>分析范围</span>
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
                      <label className={styles.field}>
                        <span>标注目标</span>
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
                    </div>
                  </details>

                  <section className={styles.utilityPanel} aria-label="Studio 预览">
                    <div className={styles.panelHeading}>
                      <span>PREVIEW</span>
                      <h3>片段试听</h3>
                      <p role="status">{previewStatusLabel}</p>
                      {audioStatusLabel ? <p role="status">{audioStatusLabel}</p> : null}
                      <button
                        type="button"
                        onClick={() => updatePreferences({ previewEnabled: !preferences.previewEnabled })}
                      >
                        {preferences.previewEnabled ? "隐藏和弦预览" : "显示和弦预览"}
                      </button>
                    </div>
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
                  </section>
                </div>

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

                <footer className={styles.exportBar}>
                  <div>
                    <h3>导出分析结果</h3>
                    <p>将当前和弦标注写入一份新的曲谱文件。</p>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() =>
                      void application
                        .exportStudio(libraryScoreId!)
                        .then((result) => setExportStatus(result === "saved" ? "已导出标注曲谱" : "已取消导出"))
                        .catch((error: unknown) => setExportStatus(error instanceof Error ? error.message : "导出失败"))
                    }
                  >
                    导出标注曲谱
                  </button>
                  {exportStatus ? (
                    <p className={styles.exportStatus} role="status">
                      {exportStatus}
                    </p>
                  ) : null}
                </footer>
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
