import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { RecognitionJobSummary } from "@zupulse/web-core";
import type { RecognitionHistoryPort } from "../../features/pdf-omr/pdf-omr-port";
import { Button } from "../../components/ui";
import styles from "./PdfOmrHistoryPage.module.css";

export function PdfOmrHistoryPage({ history }: { history: RecognitionHistoryPort }) {
  const { t, i18n } = useTranslation("common");
  const [jobs, setJobs] = useState<readonly RecognitionJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setJobs((await history.list({ limit: 50 })).items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [history]);

  const deleteJob = useCallback(
    async (job: RecognitionJobSummary) => {
      if (!window.confirm(t("pdfOmr.history.deleteConfirm", { fileName: job.input.fileName }))) return;
      setDeletingJobId(job.jobId);
      setDeleteError(false);
      try {
        await history.delete(job.jobId);
        await load();
      } catch {
        setDeleteError(true);
      } finally {
        setDeletingJobId(null);
      }
    },
    [history, load, t],
  );

  useEffect(() => void load(), [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("pdfOmr.history.badge")}</p>
          <h1>{t("pdfOmr.history.title")}</h1>
          <p>{t("pdfOmr.history.description")}</p>
        </div>
        <Link className={styles.createLink} to="/pdf-omr/new">
          {t("pdfOmr.history.create")}
        </Link>
      </header>

      {loading ? <p role="status">{t("pdfOmr.history.loading")}</p> : null}
      {error ? (
        <div role="alert">
          <p>{t("pdfOmr.history.loadFailed")}</p>
          <Button type="button" onClick={() => void load()}>
            {t("pdfOmr.history.reload")}
          </Button>
        </div>
      ) : null}
      {!loading && !error && jobs.length === 0 ? <p>{t("pdfOmr.history.empty")}</p> : null}
      {deleteError ? <p role="alert">{t("pdfOmr.history.deleteFailed")}</p> : null}
      <ul className={styles.list}>
        {jobs.map((job) => (
          <li className={styles.job} key={job.jobId}>
            <div className={styles.jobCopy}>
              <Link className={styles.jobLink} to={`/pdf-omr/${job.jobId}`}>
                {job.input.fileName}
              </Link>
              <p className={styles.meta}>
                {statusLabel(t, job.status)} · {job.input.inputKind.toUpperCase()} · {job.engineId ?? "—"} ·{" "}
                {t("pdfOmr.history.attempts", { count: job.attemptCount })} ·{" "}
                {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(job.updatedAt),
                )}
              </p>
              <p className={styles.expires}>
                {t("pdfOmr.history.expires", {
                  date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(job.expiresAt)),
                })}
              </p>
            </div>
            <Button
              tone="danger"
              size="sm"
              aria-label={t("pdfOmr.history.deleteLabel", { fileName: job.input.fileName })}
              disabled={!canDelete(job.status) || deletingJobId === job.jobId}
              onClick={() => void deleteJob(job)}
            >
              {t("pdfOmr.history.delete")}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function canDelete(status: RecognitionJobSummary["status"]): boolean {
  return status === "cancelled" || status === "failed" || status === "interrupted" || status === "succeeded";
}

function statusLabel(
  t: ReturnType<typeof useTranslation<"common">>["t"],
  status: RecognitionJobSummary["status"],
): string {
  const keys = {
    queued: "pdfOmr.history.status.queued",
    running: "pdfOmr.history.status.running",
    cancelling: "pdfOmr.history.status.cancelling",
    cancelled: "pdfOmr.history.status.cancelled",
    failed: "pdfOmr.history.status.failed",
    interrupted: "pdfOmr.history.status.interrupted",
    succeeded: "pdfOmr.history.status.succeeded",
    deleting: "pdfOmr.history.status.deleting",
  } as const;
  return t(keys[status]);
}
