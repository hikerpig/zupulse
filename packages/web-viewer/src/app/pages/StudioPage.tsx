import { useParams } from "react-router";
import type { ViewerApplication } from "../ViewerApplication";
import styles from "./PageShell.module.css";

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { libraryScoreId } = useParams();
  const snapshot = application.getSnapshot();
  const active = libraryScoreId !== undefined && snapshot.currentLibraryScoreId === libraryScoreId;
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  return (
    <main className={styles.page} aria-labelledby="studio-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Harmony Analysis Studio</p>
          <h1 id="studio-title">和弦分析工作室</h1>
        </div>
        <span role="status">{active ? "曲谱已加载" : "等待曲谱加载"}</span>
      </header>
      <section aria-label="分析状态">
        <h2>分析结果</h2>
        <p>{libraryScoreId ? `Library Score: ${libraryScoreId}` : "缺少曲谱 ID"}</p>
        {storageAvailable ? <p>首次分析、修正与导出将在此工作区完成。</p> : <p role="alert">和声分析存储不可用</p>}
      </section>
    </main>
  );
}
