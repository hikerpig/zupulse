import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ScoreViewer } from "../../components/ScoreViewer";
import { StudioSplitWorkspace } from "../../components/studio-split-workspace";
import { useStudioLifecycle } from "../../features/harmony-studio/adapters/use-studio-lifecycle";
import { useStudioSnapshot } from "../../features/harmony-studio/adapters/use-studio-snapshot";
import { StudioAnalysisPanel } from "../../features/harmony-studio/components/studio-analysis-panel";
import {
  createStudioRanges,
  findSelectedStudioRange,
  type StudioRange,
} from "../../features/harmony-studio/model/studio-page-model";
import type { ViewerApplication } from "../ViewerApplication";
import { loadStudioPreferences, saveStudioPreferences, type StudioPreferences } from "../studio-preferences";
import styles from "./StudioPage.module.css";

export function StudioPage({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("studio");
  const { libraryScoreId } = useParams();
  const selectStudio = useCallback(
    (snapshot: ReturnType<ViewerApplication["getSnapshot"]>) =>
      snapshot.studio?.libraryScoreId === libraryScoreId ? snapshot.studio : undefined,
    [libraryScoreId],
  );
  const studio = useStudioSnapshot(application, selectStudio);
  const storageAvailable = application.hasHarmonyAnalysisStorage();
  const active =
    libraryScoreId !== undefined && studio !== undefined && application.getCurrentStudioSession?.() !== undefined;
  const ranges = useMemo(() => createStudioRanges(studio), [studio]);
  const [fallbackSelectedKey, setFallbackSelectedKey] = useState<string>();
  const selectedRange = findSelectedStudioRange(studio, ranges, fallbackSelectedKey);
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
      setFallbackSelectedKey(item.key);
      application.selectStudioRange(libraryScoreId, item.effective.range);
    },
    [application, libraryScoreId],
  );

  useStudioLifecycle({
    application,
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
