import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ImportItemResult } from "@zupulse/web-core";
import styles from "../../SheetLibrary.module.css";
import type { ImportSummaryState } from "../sheet-library-types";

export function ImportSummary({
  summary,
  onCancel,
  onDismiss,
}: {
  summary: ImportSummaryState;
  onCancel(): void;
  onDismiss(): void;
}) {
  const { t } = useTranslation("library");
  const created = summary.results.filter((item) => item.status === "created");
  const existing = summary.results.filter((item) => item.status === "existing");
  const failed = summary.results.filter((item) => item.status === "failed");
  const compactResult =
    !summary.running && summary.total === 1 && summary.cancelled === 0 && summary.results.length === 1
      ? summary.results[0]
      : undefined;
  const compact = compactResult?.status === "created";

  useEffect(() => {
    if (!compact) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [compact, onDismiss]);

  if (compact && compactResult.status === "created") {
    return (
      <section className={styles.importSummaryCompact} role="status" aria-live="polite">
        <span>{t("importSummary.compactCreated", { title: compactResult.score.title })}</span>
        <button type="button" aria-label={t("importSummary.close")} onClick={onDismiss}>
          {t("importSummary.close")}
        </button>
      </section>
    );
  }

  return (
    <section
      className={styles.importSummary}
      aria-label={t("importSummary.label", {
        created: created.length,
        existing: existing.length,
        failed: failed.length,
        cancelled: summary.cancelled,
      })}
      aria-live="polite"
    >
      <div className={styles.importSummaryHeader}>
        <div>
          <strong>{summary.running ? t("importSummary.running") : t("importSummary.complete")}</strong>
          <span>{t("importSummary.progress", { processed: summary.results.length, total: summary.total })}</span>
        </div>
        <button type="button" onClick={summary.running ? onCancel : onDismiss}>
          {summary.running ? t("importSummary.cancelPending") : t("importSummary.close")}
        </button>
      </div>
      <div className={styles.importSummaryCounts}>
        <span>{t("importSummary.created", { count: created.length })}</span>
        <span>{t("importSummary.existing", { count: existing.length })}</span>
        <span>{t("importSummary.failed", { count: failed.length })}</span>
        {summary.cancelled > 0 ? <span>{t("importSummary.cancelled", { count: summary.cancelled })}</span> : null}
      </div>
      {summary.results.length ? (
        <details className={styles.importSummaryDetails} open={failed.length > 0}>
          <summary>{t("importSummary.details")}</summary>
          <ul>
            {summary.results.map((item, index) => (
              <li key={`${importResultFileName(item)}-${index}`}>
                <span>{importResultFileName(item)}</span>
                <code>
                  {item.status === "failed"
                    ? t("importSummary.statusFailed", { code: item.error.code })
                    : t(`importSummary.status${item.status === "created" ? "Created" : "Existing"}`)}
                </code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function importResultFileName(result: ImportItemResult): string {
  return result.status === "failed" ? result.fileName : result.score.fileName;
}
