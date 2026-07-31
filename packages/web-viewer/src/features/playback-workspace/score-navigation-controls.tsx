import { BookOpen, ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { persistScoreNavigationMode, useAppStore } from "../../app/appStore";
import { ContextPopup } from "../../components/ContextPopup";
import type { ViewerSessionHandle } from "../../host";
import styles from "../PlaybackWorkspace.module.css";

export function ScoreNavigationControls({
  navigation,
}: {
  navigation: NonNullable<ViewerSessionHandle["navigation"]>;
}) {
  const { t } = useTranslation("viewer");
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mode = useAppStore((state) => state.scoreNavigationMode);
  const setMode = useAppStore((state) => state.setScoreNavigationMode);
  const state = useSyncExternalStore(navigation.subscribe, navigation.getState, navigation.getState);

  useEffect(() => {
    navigation.setMode(mode);
  }, [mode, navigation]);

  const chooseMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    persistScoreNavigationMode(nextMode);
    setOpen(false);
  };

  return (
    <div className={styles.navigationControls}>
      {state.followState === "detached" ? (
        <button
          className={styles.transportIconButton}
          type="button"
          aria-label={t("score.returnToPlayback")}
          title={t("score.detached")}
          onClick={() => navigation.returnToPlayback()}
        >
          <LocateFixed aria-hidden="true" />
        </button>
      ) : null}
      {mode === "page-turn" && state.pageTurnAvailable ? (
        <div className={styles.pageControls}>
          <button
            type="button"
            aria-label={t("score.previousPage")}
            disabled={state.currentPage <= 0}
            onClick={() => navigation.movePage(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <output aria-label={t("score.pageStatus", { current: state.currentPage + 1, total: state.pageCount })}>
            {state.currentPage + 1} / {state.pageCount}
          </output>
          <button
            type="button"
            aria-label={t("score.nextPage")}
            disabled={state.currentPage >= state.pageCount - 1}
            onClick={() => navigation.movePage(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <button
        ref={buttonRef}
        className={styles.transportIconButton}
        type="button"
        aria-label={t("score.navigationMode")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BookOpen aria-hidden="true" />
      </button>
      <ContextPopup anchor={buttonRef.current} open={open} onOpenChange={setOpen}>
        <div className={styles.navigationModePopup} aria-label={t("score.navigationMode")}>
          <button
            className={styles.menuOption}
            type="button"
            aria-pressed={mode === "continuous"}
            onClick={() => chooseMode("continuous")}
          >
            {t("score.continuous")}
          </button>
          <button
            className={styles.menuOption}
            type="button"
            aria-pressed={mode === "page-turn"}
            onClick={() => chooseMode("page-turn")}
          >
            {t("score.pageTurn")}
          </button>
        </div>
      </ContextPopup>
    </div>
  );
}
