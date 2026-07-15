import { useEffect, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router";
import { HarmonyStudioEditor } from "../../features/harmony-studio/HarmonyStudioEditor";
import type { ViewerApplication } from "../ViewerApplication";
import styles from "./PageShell.module.css";

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { libraryScoreId } = useParams();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const active = libraryScoreId !== undefined && snapshot.currentLibraryScoreId === libraryScoreId;
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  const studio = snapshot.studio?.libraryScoreId === libraryScoreId ? snapshot.studio : undefined;
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
        ) : studio?.status === "ready" ? (
          <>
            <p role="status">已加载分析结果（{studio.document?.activeRevision.segments.length ?? 0} 个片段）</p>
            <p>已保存 {studio.document?.corrections.length ?? 0} 个修正</p>
            {studio.document?.activeRevision.segments[0] ? (
              <HarmonyStudioEditor
                candidates={studio.document.activeRevision.segments[0].alternatives}
                {...(studio.document.activeRevision.segments[0].status === "unresolved"
                  ? { unresolvedReason: studio.document.activeRevision.segments[0].reason }
                  : {})}
                onSelect={(candidate) =>
                  void application.setStudioCorrection(
                    libraryScoreId!,
                    studio.document!.activeRevision.segments[0].range,
                    {
                      type: "chord",
                      chord: candidate.chord,
                    },
                  )
                }
                onNoChord={() =>
                  void application.setStudioCorrection(
                    libraryScoreId!,
                    studio.document!.activeRevision.segments[0].range,
                    {
                      type: "no-chord",
                    },
                  )
                }
              />
            ) : null}
          </>
        ) : (
          <p>首次分析、修正与导出将在此工作区完成。</p>
        )}
      </section>
    </main>
  );
}
