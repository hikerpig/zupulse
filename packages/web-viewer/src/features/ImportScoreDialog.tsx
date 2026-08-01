import { useEffect, useState } from "react";
import { Check, FileMusic, FilePlus2, Music, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isSupportedLibraryScoreFile, type ScoreImportSource } from "@zupulse/web-core";
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

// Tailwind v4 resolves same-property utility conflicts by stylesheet order, so
// these elements never combine two classes that set the same property; each
// state swaps the full background/border set instead of layering overrides.
const dropZoneBaseClasses =
  "tw:flex tw:w-full tw:cursor-pointer tw:select-none tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-panel tw:border tw:px-4 tw:py-6 tw:text-center tw:font-ui tw:text-foreground tw:transition-colors tw:duration-fast tw:ease-ui tw:focus-visible:outline-none tw:focus-visible:shadow-focus tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed";
const dropZoneIdleClasses = "tw:border-border tw:bg-transparent tw:hover:border-border-strong tw:hover:bg-elevated";
const dropZoneActiveClasses = "tw:border-solid tw:border-accent tw:bg-accent-soft";

const sampleRowBaseClasses =
  "tw:flex tw:w-full tw:cursor-pointer tw:select-none tw:items-center tw:gap-3 tw:rounded-control tw:border tw:border-solid tw:border-border tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:font-ui tw:text-foreground tw:transition-colors tw:duration-fast tw:ease-ui tw:hover:bg-elevated tw:focus-visible:outline-none tw:focus-visible:shadow-focus tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed";

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
  onDropFiles?(files: readonly File[]): readonly ScoreImportSource[] | Promise<readonly ScoreImportSource[]>;
  sampleScores: readonly BundledSampleScore[];
  onSelectSample?(id: BundledSampleScore["id"]): ScoreImportSource | undefined;
  onImport(sources: readonly ScoreImportSource[]): Promise<void>;
}) {
  const { t } = useTranslation("library");
  const [candidates, setCandidates] = useState<readonly ScoreImportSource[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [processingDrop, setProcessingDrop] = useState(false);
  const [skippedUnsupported, setSkippedUnsupported] = useState(0);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    if (open) return;
    setCandidates([]);
    setSelecting(false);
    setSelectionFailed(false);
    setSkippedUnsupported(0);
    setDropActive(false);
    setProcessingDrop(false);
  }, [open]);

  // Files enter here from every host path (picker bypasses, drops); gate with the
  // same Library support rule as the import pipeline so unsupported files never
  // reach the candidate list.
  const addCandidates = (sources: readonly ScoreImportSource[]) => {
    const supported = sources.filter((source) => isSupportedLibraryScoreFile(source.fileName));
    setSkippedUnsupported(sources.length - supported.length);
    if (supported.length) setCandidates((current) => [...current, ...supported]);
  };

  const selectFiles = async () => {
    setSelecting(true);
    setSelectionFailed(false);
    try {
      addCandidates(await onSelectFiles());
    } catch {
      setSelectionFailed(true);
    } finally {
      setSelecting(false);
    }
  };

  const dropZoneLabel = t(
    selecting || processingDrop
      ? "importDialog.selecting"
      : dropActive
        ? "importDialog.dropActive"
        : onDropFiles
          ? "importDialog.selectOrDropFiles"
          : "importDialog.selectFiles",
  );

  return (
    <DialogPortal>
      <DialogBackdrop
        onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
        onDrop={onDropFiles ? (event) => event.preventDefault() : undefined}
      />
      <DialogViewport>
        <DialogPopup
          className="tw:max-w-2xl tw:grid tw:gap-6"
          onDragOver={onDropFiles ? (event) => event.preventDefault() : undefined}
          onDrop={onDropFiles ? (event) => event.preventDefault() : undefined}
        >
          <div className="tw:grid tw:gap-1">
            <DialogTitle>{t("importDialog.title")}</DialogTitle>
            <DialogDescription>{t("importDialog.description")}</DialogDescription>
          </div>
          <div className="tw:grid tw:gap-2">
            <button
              type="button"
              aria-label={dropZoneLabel}
              data-testid="import-score-picker"
              className={`${dropZoneBaseClasses} ${dropActive ? dropZoneActiveClasses : dropZoneIdleClasses} ${
                onDropFiles && !dropActive ? "tw:border-dashed" : "tw:border-solid"
              }`}
              disabled={selecting || processingDrop}
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
                      setProcessingDrop(true);
                      setSelectionFailed(false);
                      void Promise.resolve(onDropFiles(Array.from(event.dataTransfer.files)))
                        .then(addCandidates)
                        .catch(() => setSelectionFailed(true))
                        .finally(() => setProcessingDrop(false));
                    }
                  : undefined
              }
            >
              <span
                aria-hidden="true"
                className={`tw:grid tw:place-items-center tw:rounded-control tw:p-3 tw:transition-colors tw:duration-fast tw:ease-ui ${
                  dropActive ? "tw:bg-surface tw:text-accent" : "tw:bg-control tw:text-muted"
                }`}
              >
                {selecting ? (
                  <span className="tw:animate-spin tw:size-5 tw:rounded-icon tw:border-2 tw:border-current tw:border-r-transparent tw:motion-reduce:animate-none" />
                ) : (
                  <FilePlus2 className="tw:size-5" />
                )}
              </span>
              <span className="tw:font-semibold tw:text-body">{dropZoneLabel}</span>
              <span className="tw:max-w-md tw:leading-relaxed tw:text-caption tw:text-muted">
                {t("importDialog.hint")}
              </span>
            </button>
            {selectionFailed ? (
              <p className="tw:m-0 tw:text-caption tw:text-danger" role="alert">
                {t("importDialog.selectionFailed")}
              </p>
            ) : null}
            {skippedUnsupported ? (
              <p className="tw:m-0 tw:text-caption tw:text-warning" role="status">
                {t("importDialog.unsupportedSkipped", { count: skippedUnsupported })}
              </p>
            ) : null}
          </div>
          {candidates.length ? (
            <ul
              className="tw:max-h-56 tw:m-0 tw:grid tw:list-none tw:gap-px tw:overflow-y-auto tw:rounded-control tw:border tw:border-solid tw:border-border tw:bg-border tw:p-0"
              aria-label={t("importDialog.candidates")}
            >
              {candidates.map((candidate, index) => (
                <li
                  className="tw:py-1.5 tw:flex tw:min-h-control tw:min-w-0 tw:items-center tw:gap-2 tw:bg-elevated tw:pr-2 tw:pl-3 tw:text-caption"
                  key={`${candidate.fileName}-${index}`}
                >
                  <FileMusic className="tw:size-4 tw:shrink-0 tw:text-subtle" aria-hidden="true" />
                  <span className="tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                    {candidate.fileName}
                  </span>
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
              className="tw:grid tw:gap-3 tw:border-x-0 tw:border-t tw:border-b-0 tw:border-solid tw:border-border tw:pt-4"
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
                  <button
                    key={sample.id}
                    type="button"
                    className={sampleRowBaseClasses}
                    disabled={selected}
                    aria-label={t("importDialog.useSample", { title: sample.title })}
                    onClick={() => {
                      const source = onSelectSample(sample.id);
                      if (source) setCandidates((current) => [...current, source]);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="tw:grid tw:shrink-0 tw:place-items-center tw:rounded-control tw:bg-control tw:p-2 tw:text-muted"
                    >
                      <Music className="tw:size-4" />
                    </span>
                    <span className="tw:gap-0.5 tw:grid tw:min-w-0 tw:flex-1">
                      <strong className="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
                        {sample.title}
                      </strong>
                      <small className="tw:font-normal tw:text-caption tw:text-muted">
                        {t("importDialog.sampleAttribution", { attribution: sample.attribution })}
                      </small>
                    </span>
                    {selected ? (
                      <span className="tw:font-semibold tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1 tw:text-caption tw:text-ready">
                        <Check className="tw:size-4" aria-hidden="true" />
                        {t("importDialog.sampleAdded")}
                      </span>
                    ) : (
                      <span className="tw:font-semibold tw:shrink-0 tw:text-caption tw:text-accent">
                        {t("importDialog.sampleAction")}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ) : null}
          <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2">
            <DialogClose render={<Button tone="ghost" data-testid="import-score-cancel" />} disabled={processingDrop}>
              {t("cancel")}
            </DialogClose>
            <DialogClose
              render={
                <Button
                  tone="primary"
                  data-testid="import-score-submit"
                  disabled={candidates.length === 0 || processingDrop}
                  onClick={() => void onImport(candidates)}
                />
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
