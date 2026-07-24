import { useEffect, useState, useSyncExternalStore, useRef } from "react";
import { useParams } from "react-router";
import { Undo2, Redo2, Settings, Volume2, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { createHarmonyRangeViewItems } from "../../features/harmony-studio/harmony-range-view-model";
import { HarmonyRangeWorkspace } from "../../features/harmony-studio/harmony-range-workspace";
import { HarmonyStudioEditor } from "../../features/harmony-studio/HarmonyStudioEditor";
import { ScoreViewer } from "../../components/ScoreViewer";
import { StudioSplitWorkspace } from "../../components/studio-split-workspace";
import { ContextPopup } from "../../components/ContextPopup";
import type { ViewerApplication, ViewerApplicationSnapshot } from "../ViewerApplication";
import type { ApplicationIssue } from "../applicationIssue";
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

function documentStatusLabel(
  status: NonNullable<ViewerApplicationSnapshot["studio"]>["status"],
  segmentCount: number,
  correctionCount: number,
  t: TFunction<"studio">,
): string {
  const counts = t("counts", { segments: segmentCount, corrections: correctionCount });
  if (status === "saving") return t("statusSaving", { counts });
  if (status === "analyzing") return t("statusAnalyzing", { counts });
  if (status === "unsaved") return t("statusUnsaved", { counts });
  if (status === "conflict") return t("statusConflict", { counts });
  if (status === "error") return t("statusError", { counts });
  return t("statusSaved", { counts });
}

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("studio");
  const { t: tErrors } = useTranslation("errors");
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const preview = studio?.transport ?? {
    status: "paused",
    positionTicks: 0,
    speed: 1,
  };
  const previewStatusLabel =
    preview.status === "playing"
      ? t("previewPlaying")
      : preview.status === "stopped"
        ? t("previewStopped")
        : t("previewPaused");
  const audioStatusLabel =
    studio?.audioStatus === "loading"
      ? t("audioLoading")
      : studio?.audioStatus === "ready"
        ? t("audioReady")
        : studio?.audioStatus === "error"
          ? t("audioFailed")
          : studio?.audioStatus === "unavailable"
            ? t("audioDisabled")
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
    <main className={styles.studioShell} aria-label={t("workspaceLabel")}>
      <StudioSplitWorkspace
        split={preferences.split}
        onSplitChange={(split) => updatePreferences({ split })}
        scoreClassName={styles.scorePane}
        analysisClassName={styles.analysisRegion}
        score={
          <>
            {!active ? (
              <h2 id="summary" className="sr-only">
                {t("noScore")}
              </h2>
            ) : null}
            <ScoreViewer expandable />
          </>
        }
        analysis={
          <section aria-label={t("analysisRegion")}>
            <div className={styles.analysisHeading}>
              <div>
                <p className={styles.sectionKicker}>{t("kicker")}</p>
                <h1>{t("title")}</h1>
                <p>{t("subtitle")}</p>
              </div>
            </div>
            {!storageAvailable ? (
              <p className={styles.alert} role="alert">
                {t("storageUnavailable")}
              </p>
            ) : studio?.status === "loading" && !studioDocument ? (
              <p className={styles.emptyState} role="status">
                {t("initializing")}
              </p>
            ) : studio?.status === "error" && !studioDocument ? (
              <p className={styles.alert} role="alert">
                {studioIssueMessage(studio.error, tErrors)}
              </p>
            ) : studioDocument ? (
              <>
                <div className={styles.commandBar}>
                  <div className={styles.documentStatus}>
                    <p role="status" aria-label={t("documentStatus")}>
                      {documentStatusLabel(
                        studio.status,
                        studioDocument.activeRevision.segments.length,
                        studioDocument.corrections.length,
                        t,
                      )}
                    </p>
                  </div>
                  <div className={styles.commandGroups}>
                    <div className={styles.buttonGroup} role="group" aria-label={t("history")}>
                      <button
                        type="button"
                        onClick={() => application.undoStudio(libraryScoreId!)}
                        aria-label={t("undo")}
                        title={t("undo")}
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => application.redoStudio(libraryScoreId!)}
                        aria-label={t("redo")}
                        title={t("redo")}
                      >
                        <Redo2 size={16} />
                      </button>
                    </div>
                    <div className={styles.buttonGroup} role="group" aria-label={t("analysisControls")}>
                      {studio.status === "analyzing" ? (
                        <button type="button" onClick={() => application.cancelStudioReanalysis(libraryScoreId!)}>
                          {t("cancelAnalysis")}
                        </button>
                      ) : (
                        <button type="button" onClick={() => void application.reanalyzeStudio(libraryScoreId!)}>
                          {t("reanalyze")}
                        </button>
                      )}
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void application.flushStudio(libraryScoreId!)}
                      >
                        {t("save")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void application
                            .exportStudio(libraryScoreId!)
                            .then((result) =>
                              setExportStatus(result === "saved" ? t("exportSaved") : t("exportCancelled")),
                            )
                            .catch(() => setExportStatus(t("exportFailed")))
                        }
                        aria-label={t("export")}
                        title={t("export")}
                      >
                        <Download size={16} />
                      </button>
                    </div>
                    <div className={styles.buttonGroup} role="group" aria-label={t("settingsAndPreview")}>
                      <button
                        ref={settingsButtonRef}
                        type="button"
                        onClick={() => {
                          setSettingsOpen(!settingsOpen);
                          setPreviewOpen(false);
                        }}
                        aria-label={t("settings")}
                        title={t("settings")}
                      >
                        <Settings size={16} />
                      </button>
                      <button
                        ref={previewButtonRef}
                        type="button"
                        onClick={() => {
                          setPreviewOpen(!previewOpen);
                          setSettingsOpen(false);
                        }}
                        aria-label={t("preview")}
                        title={t("preview")}
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                {exportStatus ? (
                  <p className={styles.exportStatus} role="status">
                    {exportStatus}
                  </p>
                ) : null}
                {studio.status === "conflict" || studio.status === "error" ? (
                  <p className={styles.alert} role="alert">
                    {studioIssueMessage(studio.error, tErrors)}
                  </p>
                ) : null}
                {studio.previewError ? (
                  <p className={styles.alert} role="alert">
                    {t("previewUnavailable", { message: studioIssueMessage(studio.previewError, tErrors) })}
                    <button
                      type="button"
                      onClick={() =>
                        (application as unknown as { retryStudioPreview?: (id: string) => void }).retryStudioPreview?.(
                          libraryScoreId!,
                        )
                      }
                    >
                      {t("retryPreview")}
                    </button>
                  </p>
                ) : null}
                {studio.audioError ? (
                  <p className={styles.alert} role="alert">
                    {t("audioUnavailable", { message: studioIssueMessage(studio.audioError, tErrors) })}
                  </p>
                ) : null}
                {studio.selectionNotice ? (
                  <p className={styles.emptyState} role="status" aria-label={t("selectionNoticeLabel")}>
                    {t("selectionNotice")}
                  </p>
                ) : null}

                <ContextPopup anchor={settingsButtonRef.current} open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <div>
                    <p className={styles.sectionKicker}>{t("settingsKicker")}</p>
                    <h3>{t("settings")}</h3>
                    <details className={styles.popupSection} open={false}>
                      <summary>{t("analysisScope")}</summary>
                      <label className={styles.field}>
                        <select
                          multiple
                          aria-label={t("analysisScope")}
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
                    </details>
                    <details className={styles.popupSection} open>
                      <summary>{t("annotationTarget")}</summary>
                      <label className={styles.field}>
                        <select
                          aria-label={t("annotationTarget")}
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
                    </details>
                  </div>
                </ContextPopup>

                <ContextPopup anchor={previewButtonRef.current} open={previewOpen} onOpenChange={setPreviewOpen}>
                  <div>
                    <p className={styles.sectionKicker}>{t("previewKicker")}</p>
                    <h3>{t("preview")}</h3>
                    <p role="status">{previewStatusLabel}</p>
                    {audioStatusLabel ? <p role="status">{audioStatusLabel}</p> : null}
                    <button
                      type="button"
                      onClick={() => updatePreferences({ previewEnabled: !preferences.previewEnabled })}
                    >
                      {preferences.previewEnabled ? t("hideChordPreview") : t("showChordPreview")}
                    </button>
                    <div className={styles.previewControls}>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          application.toggleStudioPreview(libraryScoreId!);
                        }}
                      >
                        {preview.status === "playing" ? t("pausePreview") : t("playPreview")}
                      </button>
                      <label className={`${styles.field} ${styles.positionField}`}>
                        <span>{t("previewPosition")}</span>
                        <input
                          type="range"
                          aria-label={t("previewPosition")}
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
                        <span>{t("speed")}</span>
                        <select
                          aria-label={t("previewSpeed")}
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
                        {preview.loop ? t("disableSelectedLoop") : t("loopSelected")}
                      </button>
                    </div>
                  </div>
                </ContextPopup>

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
                        <div className={styles.segmentActions} aria-label={t("segmentActions")}>
                          <button
                            type="button"
                            onClick={() =>
                              void application.resetStudioCorrection(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            {t("resetSegment")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.splitStudioCorrection(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            {t("splitCorrection")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.mergeStudioCorrections(libraryScoreId!, selectedRange.effective.range)
                            }
                          >
                            {t("mergeCorrections")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.moveStudioCorrection(libraryScoreId!, selectedRange.effective.range, -1)
                            }
                          >
                            {t("moveLeft")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void application.moveStudioCorrection(libraryScoreId!, selectedRange.effective.range, 1)
                            }
                          >
                            {t("moveRight")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.emptyState}>{t("noEditableSegment")}</p>
                    )
                  }
                />
              </>
            ) : (
              <p className={styles.emptyState}>{t("empty")}</p>
            )}
          </section>
        }
      />
    </main>
  );
}

function studioIssueMessage(issue: ApplicationIssue | undefined, t: TFunction<"errors">): string {
  switch (issue?.code) {
    case "studio-storage-unavailable":
      return t("application.studioStorageUnavailable");
    case "score-not-found":
      return t("application.scoreNotFound");
    case "studio-format-unsupported":
      return t("application.studioFormatUnsupported");
    case "studio-runtime-unavailable":
      return t("application.studioRuntimeUnavailable");
    case "studio-analyzer-unavailable":
      return t("application.studioAnalyzerUnavailable");
    case "studio-no-analyzable-tracks":
      return t("application.studioNoAnalyzableTracks");
    case "studio-version-conflict":
      return t("application.studioVersionConflict");
    case "studio-save-failed":
      return t("application.studioSaveFailed");
    case "studio-preview-unavailable":
      return t("application.studioPreviewUnavailable");
    case "studio-preview-failed":
      return t("application.studioPreviewFailed");
    case "studio-audio-unavailable":
      return t("application.studioAudioUnavailable");
    default:
      return t("application.studioGeneric");
  }
}
