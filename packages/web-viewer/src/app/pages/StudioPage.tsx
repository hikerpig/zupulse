import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { reducePreviewTransport } from "@zupulse/web-core";
import { HarmonyStudioEditor } from "../../features/harmony-studio/HarmonyStudioEditor";
import type { ViewerApplication } from "../ViewerApplication";
import styles from "./PageShell.module.css";

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { libraryScoreId } = useParams();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const active = libraryScoreId !== undefined && snapshot.currentLibraryScoreId === libraryScoreId;
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  const studio = snapshot.studio?.libraryScoreId === libraryScoreId ? snapshot.studio : undefined;
  const studioDocument = studio?.document;
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const selectedSegment = studioDocument?.activeRevision.segments[selectedSegmentIndex];
  const [exportStatus, setExportStatus] = useState<string>();
  const [preview, dispatchPreview] = useReducer(reducePreviewTransport, {
    status: "paused",
    positionTicks: 0,
    speed: 1,
  });
  useEffect(() => {
    if (libraryScoreId && storageAvailable) void application.openStudio(libraryScoreId);
  }, [application, libraryScoreId, storageAvailable]);
  return (
    <main className={styles.page} aria-labelledby="studio-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Harmony Analysis Studio</p>
          <h1 id="studio-title">和弦分析工作室</h1>
        </div>
        <span role="status">{active ? "曲谱已加载" : "等待曲谱加载"}</span>
        {libraryScoreId ? <Link to={`/viewer/${libraryScoreId}`}>返回查看器</Link> : null}
      </header>
      <section aria-label="分析状态">
        <h2>分析结果</h2>
        <p>{libraryScoreId ? `Library Score: ${libraryScoreId}` : "缺少曲谱 ID"}</p>
        {!storageAvailable ? (
          <p role="alert">和声分析存储不可用</p>
        ) : studio?.status === "loading" ? (
          <p role="status">正在初始化和声分析…</p>
        ) : studio?.status === "error" ? (
          <p role="alert">{studio.error}</p>
        ) : studioDocument ? (
          <>
            <p role="status">
              {studio.status === "saving"
                ? "正在保存修正…"
                : studio.status === "unsaved"
                  ? "修正尚未保存"
                  : "已加载分析结果"}
              （{studioDocument.activeRevision.segments.length} 个片段）
            </p>
            {studio.status === "conflict" ? <p role="alert">{studio.error}</p> : null}
            <p>
              {studio.status === "ready" ? "已保存" : "待保存"} {studioDocument.corrections.length} 个修正
            </p>
            <div aria-label="修正历史">
              <button type="button" onClick={() => application.undoStudio(libraryScoreId!)}>
                撤销修正
              </button>
              <button type="button" onClick={() => application.redoStudio(libraryScoreId!)}>
                重做修正
              </button>
            </div>
            <label>
              分析范围
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
                {studioDocument.activeRevision.parameters.scope.includedTrackIds.map((trackId) => (
                  <option key={trackId} value={trackId}>
                    {trackId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              标注目标
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
                {studioDocument.activeRevision.parameters.scope.includedTrackIds.map((trackId) => (
                  <option key={trackId} value={trackId}>
                    {trackId}
                  </option>
                ))}
              </select>
            </label>
            <section aria-label="Studio 预览">
              <h3>Studio 预览</h3>
              <p role="status">{preview.status === "playing" ? "预览播放中" : "预览已暂停"}</p>
              <button
                type="button"
                onClick={() => dispatchPreview({ type: preview.status === "playing" ? "pause" : "play" })}
              >
                {preview.status === "playing" ? "暂停预览" : "播放预览"}
              </button>
              <label>
                预览位置
                <input
                  type="range"
                  aria-label="预览位置"
                  min="0"
                  max="10000"
                  value={preview.positionTicks}
                  onChange={(event) =>
                    dispatchPreview({ type: "seek", positionTicks: Number(event.currentTarget.value) })
                  }
                />
              </label>
              <label>
                预览速度
                <select
                  aria-label="预览速度"
                  value={preview.speed}
                  onChange={(event) => dispatchPreview({ type: "speed", speed: Number(event.currentTarget.value) })}
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
                disabled={!selectedSegment}
                onClick={() =>
                  dispatchPreview({
                    type: "loop",
                    ...(selectedSegment
                      ? {
                          range: {
                            startTicks: selectedSegment.range.start.offsetTicks,
                            endTicks: selectedSegment.range.end.offsetTicks,
                          },
                        }
                      : {}),
                  })
                }
              >
                {preview.loop ? "取消选中片段循环" : "循环选中片段"}
              </button>
            </section>
            <button
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
            {exportStatus ? <p role="status">{exportStatus}</p> : null}
            <div role="list" aria-label="分析片段">
              {studioDocument.activeRevision.segments.map((segment, index) => (
                <button
                  key={`${segment.range.start.measureIndex}:${segment.range.start.offsetTicks}`}
                  type="button"
                  aria-pressed={index === selectedSegmentIndex}
                  onClick={() => setSelectedSegmentIndex(index)}
                >
                  片段 {index + 1}
                </button>
              ))}
            </div>
            {selectedSegment ? (
              <>
                <HarmonyStudioEditor
                  candidates={selectedSegment.alternatives}
                  {...(selectedSegment.status === "unresolved" ? { unresolvedReason: selectedSegment.reason } : {})}
                  onSelect={(candidate) =>
                    void application.setStudioCorrection(libraryScoreId!, selectedSegment.range, {
                      type: "chord",
                      chord: candidate.chord,
                    })
                  }
                  onApply={(chord) =>
                    void application.setStudioCorrection(libraryScoreId!, selectedSegment.range, {
                      type: "chord",
                      chord,
                    })
                  }
                  onNoChord={() =>
                    void application.setStudioCorrection(libraryScoreId!, selectedSegment.range, {
                      type: "no-chord",
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => void application.resetStudioCorrection(libraryScoreId!, selectedSegment.range)}
                >
                  重置选中片段
                </button>
                <button
                  type="button"
                  onClick={() => void application.splitStudioCorrection(libraryScoreId!, selectedSegment.range)}
                >
                  拆分选中修正
                </button>
              </>
            ) : null}
          </>
        ) : (
          <p>首次分析、修正与导出将在此工作区完成。</p>
        )}
      </section>
    </main>
  );
}
