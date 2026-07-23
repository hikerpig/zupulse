import { useEffect, useState } from "react";
import { CircleSlash2, LibraryBig, Music2 } from "lucide-react";
import { Link, useParams } from "react-router";
import type { ViewerApplication } from "../ViewerApplication";
import styles from "./PageShell.module.css";

export function StudioUnavailablePage({ application }: { application: ViewerApplication }) {
  const { libraryScoreId } = useParams();
  const [scoreName, setScoreName] = useState("当前曲谱");

  useEffect(() => {
    if (!libraryScoreId) return;
    let active = true;
    void application
      .getLibraryScore(libraryScoreId)
      .then((score) => {
        if (active && score) setScoreName(score.metadata.titleOverride ?? score.title);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [application, libraryScoreId]);

  return (
    <main className={styles.unavailableShell} aria-labelledby="studio-unavailable-title">
      <section className={styles.unavailableWorkspace}>
        <CircleSlash2 className={styles.unavailableIcon} aria-hidden="true" size={28} strokeWidth={1.8} />
        <div className={styles.unavailableContent}>
          <p className={styles.appKicker}>Harmony Analysis</p>
          <h1 id="studio-unavailable-title" className={styles.unavailableTitle}>
            和弦分析暂不可用
          </h1>
          <p className={styles.unavailableScore}>{scoreName}</p>
          <p className={styles.unavailableCopy}>iPad 版目前保留此工作区入口，分析与编辑能力将在后续版本提供。</p>
        </div>
        <nav className={styles.unavailableActions} aria-label="离开和弦分析">
          {libraryScoreId ? (
            <Link className={styles.unavailablePrimaryAction} to={`/viewer/${libraryScoreId}`}>
              <Music2 aria-hidden="true" size={16} />
              返回查看器
            </Link>
          ) : null}
          <Link className={styles.unavailableSecondaryAction} to="/">
            <LibraryBig aria-hidden="true" size={16} />
            返回曲谱库
          </Link>
        </nav>
      </section>
    </main>
  );
}
