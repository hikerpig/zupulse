import { useEffect, useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScoreImportSource } from "@zupulse/web-core";
import type { BundledSampleScore } from "../sample-scores";
import {
  Button,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
  IconButton,
} from "../components/ui";

export function ImportScoreDialog({
  open,
  onSelectFiles,
  onDropFiles,
  sampleScores,
  onSelectSample,
  onImport,
}: {
  open: boolean;
  onSelectFiles(): Promise<readonly ScoreImportSource[]>;
  onDropFiles?(files: readonly File[]): readonly ScoreImportSource[];
  sampleScores: readonly BundledSampleScore[];
  onSelectSample?(id: BundledSampleScore["id"]): ScoreImportSource | undefined;
  onImport(sources: readonly ScoreImportSource[]): Promise<void>;
}) {
  const { t } = useTranslation("library");
  const [candidates, setCandidates] = useState<readonly ScoreImportSource[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    if (open) return;
    setCandidates([]);
    setSelecting(false);
    setSelectionFailed(false);
    setDropActive(false);
  }, [open]);

  const selectFiles = async () => {
    setSelecting(true);
    setSelectionFailed(false);
    try {
      const selected = await onSelectFiles();
      if (selected.length) setCandidates((current) => [...current, ...selected]);
    } catch {
      setSelectionFailed(true);
    } finally {
      setSelecting(false);
    }
  };

  return (
    <DialogPortal>
      <DialogBackdrop
        onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
        onDrop={onDropFiles ? (event) => event.preventDefault() : undefined}
      />
      <DialogViewport>
        <DialogPopup
          className="tw:max-w-2xl tw:grid tw:gap-4"
          onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
          onDrop={onDropFiles ? (event) => event.preventDefault() : undefined}
        >
          <div className="tw:grid tw:gap-1">
            <DialogTitle>{t("importDialog.title")}</DialogTitle>
            <DialogDescription>{t("importDialog.description")}</DialogDescription>
          </div>
          <p className="tw:leading-relaxed tw:m-0 tw:rounded-control tw:border tw:border-solid tw:border-border tw:bg-elevated tw:p-3 tw:text-caption tw:text-muted">
            {t("importDialog.hint")}
          </p>
          <Button
            className={`tw:min-h-22 tw:h-auto tw:w-full ${
              dropActive ? "tw:border-solid tw:border-accent tw:bg-accent-soft" : "tw:border-dashed"
            }`}
            loading={selecting}
            onClick={() => void selectFiles()}
            onDragEnter={
              onDropFiles
                ? (event) => {
                    event.preventDefault();
                    setDropActive(true);
                  }
                : undefined
            }
            onDragLeave={onDropFiles ? () => setDropActive(false) : undefined}
            onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
            onDrop={
              onDropFiles
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDropActive(false);
                    const dropped = onDropFiles(Array.from(event.dataTransfer.files));
                    if (dropped.length) setCandidates((current) => [...current, ...dropped]);
                  }
                : undefined
            }
          >
            <FilePlus2 className="tw:size-4 tw:shrink-0" aria-hidden="true" />
            {t(
              selecting
                ? "importDialog.selecting"
                : dropActive
                  ? "importDialog.dropActive"
                  : onDropFiles
                    ? "importDialog.selectOrDropFiles"
                    : "importDialog.selectFiles",
            )}
          </Button>
          {selectionFailed ? (
            <p className="tw:m-0 tw:text-caption tw:text-danger" role="alert">
              {t("importDialog.selectionFailed")}
            </p>
          ) : null}
          {candidates.length ? (
            <ul
              className="tw:max-h-56 tw:m-0 tw:grid tw:list-none tw:gap-px tw:overflow-y-auto tw:rounded-control tw:border tw:border-solid tw:border-border tw:bg-border tw:p-0"
              aria-label={t("importDialog.candidates")}
            >
              {candidates.map((candidate, index) => (
                <li
                  className="tw:py-1.5 tw:flex tw:min-h-control tw:min-w-0 tw:items-center tw:justify-between tw:gap-3 tw:bg-elevated tw:pr-2 tw:pl-3 tw:text-caption"
                  key={`${candidate.fileName}-${index}`}
                >
                  <span className="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{candidate.fileName}</span>
                  <IconButton
                    size="sm"
                    tone="ghost"
                    aria-label={t("importDialog.remove", { fileName: candidate.fileName })}
                    onClick={() =>
                      setCandidates((current) => current.filter((_, candidateIndex) => candidateIndex !== index))
                    }
                  >
                    <X className="tw:size-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : null}
          {sampleScores.length && onSelectSample ? (
            <section
              className="tw:grid tw:gap-2 tw:border-x-0 tw:border-t tw:border-b-0 tw:border-solid tw:border-border tw:pt-3"
              aria-labelledby="import-sample-title"
            >
              <div className="tw:grid tw:gap-1">
                <h3 id="import-sample-title" className="tw:font-semibold tw:m-0 tw:text-body">
                  {t("importDialog.sampleTitle")}
                </h3>
                <p className="tw:m-0 tw:text-caption tw:text-muted">{t("importDialog.sampleDescription")}</p>
              </div>
              {sampleScores.map((sample) => {
                const selected = candidates.some((candidate) => candidate.fileName === sample.fileName);
                return (
                  <Button
                    key={sample.id}
                    className="tw:h-auto tw:min-h-control tw:w-full tw:justify-between tw:py-2 tw:text-left"
                    disabled={selected}
                    aria-label={t("importDialog.useSample", { title: sample.title })}
                    onClick={() => {
                      const source = onSelectSample(sample.id);
                      if (source) setCandidates((current) => [...current, source]);
                    }}
                  >
                    <span className="tw:gap-0.5 tw:grid tw:min-w-0">
                      <strong className="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                        {sample.title}
                      </strong>
                      <small className="tw:font-normal tw:text-caption tw:text-muted">
                        {t("importDialog.sampleAttribution", { attribution: sample.attribution })}
                      </small>
                    </span>
                    <span className="tw:shrink-0">
                      {selected ? t("importDialog.sampleAdded") : t("importDialog.sampleAction")}
                    </span>
                  </Button>
                );
              })}
            </section>
          ) : null}
          <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
            <DialogClose render={<Button tone="ghost" />}>{t("cancel")}</DialogClose>
            <DialogClose
              render={
                <Button tone="primary" disabled={candidates.length === 0} onClick={() => void onImport(candidates)} />
              }
            >
              {t("importDialog.submit", { count: candidates.length })}
            </DialogClose>
          </div>
        </DialogPopup>
      </DialogViewport>
    </DialogPortal>
  );
}
