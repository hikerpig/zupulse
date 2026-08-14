import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ScoreViewer } from "../../components/ScoreViewer";
import { StudioSplitWorkspace } from "../../components/studio-split-workspace";
import { useStudioLifecycle } from "../../features/harmony-studio/adapters/use-studio-lifecycle";
import { useStudioSnapshot } from "../../features/harmony-studio/adapters/use-studio-snapshot";
import { StudioAnalysisPanel } from "../../features/harmony-studio/components/studio-analysis-panel";
import { findSelectedStudioRange, type StudioRange } from "../../features/harmony-studio/model/studio-page-model";
import type { StudioApplication, StudioApplicationSnapshot } from "../../features/harmony-studio/StudioApplication";
import type { ApplicationIssue } from "../applicationIssue";
import { loadStudioPreferences, saveStudioPreferences, type StudioPreferences } from "../studio-preferences";
import styles from "./StudioPage.module.css";

export function StudioPage({
  application,
  openStudio,
  onIssuePresented,
}: {
  application: StudioApplication;
  openStudio?: (libraryScoreId: string) => Promise<void>;
  onIssuePresented?: (issue: ApplicationIssue) => void;
}) {
  const { t } = useTranslation("studio");
  const { libraryScoreId } = useParams();
  const selectStudio = useCallback(
    (snapshot: StudioApplicationSnapshot | undefined) =>
      snapshot?.libraryScoreId === libraryScoreId ? snapshot : undefined,
    [libraryScoreId],
  );
  const studio = useStudioSnapshot(application, selectStudio);
  useEffect(() => {
    if (!onIssuePresented || !studio) return;
    for (const issue of [studio.error, studio.previewError, studio.audioError]) {
      if (issue) onIssuePresented(issue);
    }
  }, [onIssuePresented, studio]);
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  const active =
    libraryScoreId !== undefined && studio !== undefined && application.getCurrentStudioSession?.() !== undefined;
  const ranges = useMemo(() => studio?.ranges ?? [], [studio]);
  const selectedRange = findSelectedStudioRange(studio, ranges);
  const [preferences, setPreferences] = useState(() => loadStudioPreferences(browserStorage()));
  const updatePreferences = useCallback((next: Partial<StudioPreferences>) => {
    setPreferences((current) => {
      const updated = { ...current, ...next };
      saveStudioPreferences(browserStorage(), updated);
      return updated;
    });
  }, []);
  const selectRange = useCallback(
    (item: StudioRange) => {
      if (!libraryScoreId) return;
      application.selectRange(libraryScoreId, item.effective.range);
    },
    [application, libraryScoreId],
  );

  useStudioLifecycle({
    application,
    ...(openStudio ? { openStudio } : {}),
    libraryScoreId,
    storageAvailable,
    active,
    previewEnabled: preferences.previewEnabled,
    studio,
  });

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
            <ScoreViewer expandable domId="alpha-tab" />
          </>
        }
        analysis={
          <StudioAnalysisPanel
            application={application}
            libraryScoreId={libraryScoreId}
            storageAvailable={storageAvailable}
            studio={studio}
            ranges={ranges}
            selectedRange={selectedRange}
            preferences={preferences}
            onPreferencesChange={updatePreferences}
            onSelectRange={selectRange}
          />
        }
      />
    </main>
  );
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
