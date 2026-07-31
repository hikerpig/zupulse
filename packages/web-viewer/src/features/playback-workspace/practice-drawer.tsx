import { ChevronLeft } from "lucide-react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ViewerSessionHandle } from "../../host";
import { usePlaybackSelector } from "./adapters/use-playback-selector";
import { persistenceMessage } from "./model/playback-presenter";
import { LoopPracticePanel } from "./panels/loop-practice-panel";
import { PianoHandsPracticePanel } from "./panels/piano-hands-practice-panel";
import { PracticeOverview, PracticeSummary } from "./panels/practice-overview";
import { RhythmPracticePanel } from "./panels/rhythm-practice-panel";
import { TracksPracticePanel } from "./panels/tracks-practice-panel";
import styles from "../PlaybackWorkspace.module.css";

type PracticeView = "overview" | "rhythm" | "hands" | "loop" | "tracks";
type Playback = NonNullable<ViewerSessionHandle["playback"]>;

export function PracticeDrawer({
  playback,
  closeButtonRef,
  onClose,
}: {
  playback: Playback;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}) {
  const { t } = useTranslation("viewer");
  const [practiceView, setPracticeView] = useState<PracticeView>("overview");
  return (
    <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
      <div className={styles.drawerHeader}>
        <div>
          {practiceView !== "overview" ? (
            <button autoFocus className={styles.drawerBack} type="button" onClick={() => setPracticeView("overview")}>
              <ChevronLeft aria-hidden="true" />
              {t("playback.backToPractice")}
            </button>
          ) : null}
          <h2 className={styles.drawerTitle}>{practiceViewTitle(practiceView, t)}</h2>
          {practiceView === "overview" ? <PracticeSummary playback={playback} /> : null}
        </div>
        <button
          ref={closeButtonRef}
          className={styles.drawerClose}
          type="button"
          aria-label={t("playback.closePractice")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.panelShell}>
        {practiceView === "overview" ? <PracticeOverview playback={playback} onSelect={setPracticeView} /> : null}
        {practiceView === "rhythm" ? <RhythmPracticePanel playback={playback} /> : null}
        {practiceView === "hands" ? <PianoHandsPracticePanel playback={playback} /> : null}
        {practiceView === "loop" ? <LoopPracticePanel playback={playback} /> : null}
        {practiceView === "tracks" ? <TracksPracticePanel playback={playback} /> : null}
      </div>
      <PersistenceStatus playback={playback} />
    </aside>
  );
}

function PersistenceStatus({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  const persistence = usePlaybackSelector(playback, (state) => state.persistence);
  return (
    <p className={styles.persistenceStatus} aria-live="polite">
      {persistenceMessage(persistence, t)}
    </p>
  );
}

function practiceViewTitle(view: PracticeView, t: ReturnType<typeof useTranslation<"viewer">>["t"]): string {
  if (view === "loop") return t("playback.loopTaskTitle");
  if (view === "rhythm") return t("playback.rhythmTaskTitle");
  if (view === "hands") return t("playback.handTaskTitle");
  if (view === "tracks") return t("playback.trackTaskTitle");
  return t("playback.practice");
}
