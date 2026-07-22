import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import styles from "./ScoreViewer.module.css";

export function ScoreViewer({ compact = false, expandable = false }: { compact?: boolean; expandable?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const collapse = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", collapse);
    return () => window.removeEventListener("keydown", collapse);
  }, [expanded]);

  return (
    <section
      className={`scrollable ${styles.stage} ${compact ? styles.compact : ""} ${expanded ? styles.expanded : ""}`}
      aria-label="乐谱工作区"
    >
      {expandable ? (
        <div className={styles.previewBar}>
          <div>
            <strong>乐谱预览</strong>
            <span>用于核对当前和弦片段</span>
          </div>
          <button
            className={styles.expandButton}
            type="button"
            aria-label={expanded ? "收起乐谱预览" : "放大乐谱预览"}
            aria-expanded={expanded}
            aria-keyshortcuts="Escape"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        </div>
      ) : null}
      <div className={styles.frame}>
        <section id="alpha-tab" className={`${styles.viewer} score-viewer`} aria-label="乐谱预览">
          <div className="score-empty-state">
            <p className="empty-title">打开一份乐谱开始练习</p>
            <p className="empty-copy">支持 Guitar Pro、.musicxml 与 .mxl，本地读取，不上传文件。</p>
          </div>
        </section>
      </div>
    </section>
  );
}
