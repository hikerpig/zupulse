import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ViewerPlaybackSlice } from "../../../viewer-session/viewer-session-types";
import { usePlaybackSelector } from "../adapters/use-playback-selector";
import { BpmControl } from "../components/bpm-control";
import {
  loopDisplayLabel,
  pianoPracticeSummary,
  pianoUnavailableReason,
  presentPlayback,
  rhythmSummary,
} from "../model/playback-presenter";
import { setPlaybackLoopMode } from "../runtime/loop-mode";
import styles from "../../PlaybackWorkspace.module.css";

type Playback = ViewerPlaybackSlice;

export function PracticeSummary({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  usePlaybackSelector(playback, (state) => state.scoreSpeed);
  usePlaybackSelector(playback, (state) => state.tracks);
  usePlaybackSelector(playback, (state) => state.trackState);
  const view = presentPlayback(playback.getState());
  return (
    <p className={styles.drawerSummary}>
      {t("playback.summary", {
        track: view.primaryTrackName ?? t("playback.noSelection"),
        count: view.trackCount,
        speed: view.speedPercent,
      })}
    </p>
  );
}

export function PracticeOverview({
  playback,
  onSelect,
  keyboardAvailable,
  keyboardEnabled,
}: {
  playback: Playback;
  onSelect(view: "rhythm" | "hands" | "keyboard" | "loop" | "tracks"): void;
  keyboardAvailable: boolean;
  keyboardEnabled: boolean;
}) {
  const { t } = useTranslation("viewer");
  usePlaybackSelector(playback, (state) => state.baseTempo);
  usePlaybackSelector(playback, (state) => state.scoreSpeed);
  usePlaybackSelector(playback, (state) => state.soundFont);
  usePlaybackSelector(playback, (state) => state.rhythm);
  usePlaybackSelector(playback, (state) => state.pianoPractice);
  usePlaybackSelector(playback, (state) => state.loops);
  usePlaybackSelector(playback, (state) => state.activeLoopId);
  usePlaybackSelector(playback, (state) => state.tracks);
  usePlaybackSelector(playback, (state) => state.trackState);
  const state = playback.getState();
  const view = presentPlayback(state);
  const activeLoop = view.loops.find((loop) => loop.selected);
  const dispatch = playback.dispatch;
  const openLoopEditor = () => {
    setPlaybackLoopMode(playback, state, true);
    onSelect("loop");
  };

  return (
    <>
      <section className={styles.panelSection}>
        <div className={styles.panelHeader}>
          <p className={styles.panelTitle}>{t("playback.speedTitle")}</p>
        </div>
        <div className={styles.panelContent}>
          <BpmControl
            baseTempo={view.baseTempo}
            currentTempo={view.currentTempo}
            speedPercent={view.speedPercent}
            onCommit={(tempo) => void dispatch({ type: "set-score-speed", speed: tempo / view.baseTempo })}
          />
          {view.soundFont === "error" ? (
            <button type="button" onClick={() => void dispatch({ type: "retry-soundfont" })}>
              {t("playback.retryAudio")}
            </button>
          ) : null}
        </div>
      </section>
      <div className={styles.taskList}>
        <TaskEntry
          title={t("playback.rhythmTaskTitle")}
          summary={rhythmSummary(state.rhythm.metronome.enabled, state.rhythm.countIn.enabled, t)}
          onClick={() => onSelect("rhythm")}
        />
        <TaskEntry
          title={t("playback.handTaskTitle")}
          summary={pianoPracticeSummary(state.pianoPractice, t)}
          onClick={() => onSelect("hands")}
        />
        <TaskEntry
          title={t("playback.keyboardTaskTitle")}
          summary={
            keyboardAvailable
              ? t(keyboardEnabled ? "playback.keyboardHintsOn" : "playback.keyboardHintsOff")
              : state.pianoPractice.availability === "available"
                ? t("playback.keyboardProjectionUnavailable")
                : state.pianoPractice.unavailableCode
                  ? pianoUnavailableReason(state.pianoPractice.unavailableCode, t)
                  : t("playback.handUnavailable")
          }
          disabled={!keyboardAvailable}
          onClick={() => onSelect("keyboard")}
        />
        <TaskEntry
          title={t("playback.loopTaskTitle")}
          summary={activeLoop ? loopDisplayLabel(activeLoop, t) : t("playback.loopTaskDescription")}
          onClick={openLoopEditor}
        />
        <TaskEntry
          title={t("playback.trackTaskTitle")}
          summary={
            view.primaryTrackName
              ? t("playback.primaryTrackSummary", { track: view.primaryTrackName })
              : t("playback.trackTaskDescription")
          }
          onClick={() => onSelect("tracks")}
        />
      </div>
    </>
  );
}

function TaskEntry({
  title,
  summary,
  disabled = false,
  onClick,
}: {
  title: string;
  summary: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button className={styles.taskEntry} type="button" disabled={disabled} onClick={onClick}>
      <span>
        <strong>{title}</strong>
        <small>{summary}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}
