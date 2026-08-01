import { musicalPositionFromTick } from "@zupulse/web-core";
import { Pause, Piano, Play, Repeat2, SlidersHorizontal, Square } from "lucide-react";
import { useEffect, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../components/Slider";
import { Button, IconButton, Status } from "../../components/ui";
import type { ViewerSessionHandle } from "../../host";
import { usePlaybackSelector } from "./adapters/use-playback-selector";
import { BpmControl } from "./components/bpm-control";
import { audioStatusLabel, presentPlayback } from "./model/playback-presenter";
import { setPlaybackLoopMode } from "./runtime/loop-mode";
import { createSeekPreviewScheduler } from "./runtime/seek-preview-scheduler";
import { ScoreNavigationControls } from "./score-navigation-controls";
import styles from "../PlaybackWorkspace.module.css";

export function PlaybackTransport({
  playback,
  navigation,
  drawerOpen,
  drawerToggleRef,
  onDrawerToggle,
  keyGuideAvailable,
  keyGuideEnabled,
  onKeyGuideToggle,
}: {
  playback: ViewerSessionHandle["playback"];
  navigation: ViewerSessionHandle["navigation"];
  drawerOpen: boolean;
  drawerToggleRef: RefObject<HTMLButtonElement | null>;
  onDrawerToggle(): void;
  keyGuideAvailable: boolean;
  keyGuideEnabled: boolean;
  onKeyGuideToggle(): void;
}) {
  if (!playback) {
    return (
      <DisabledPlaybackTransport
        drawerOpen={drawerOpen}
        drawerToggleRef={drawerToggleRef}
        onDrawerToggle={onDrawerToggle}
      />
    );
  }
  return (
    <ActivePlaybackTransport
      playback={playback}
      navigation={navigation}
      drawerOpen={drawerOpen}
      drawerToggleRef={drawerToggleRef}
      onDrawerToggle={onDrawerToggle}
      keyGuideAvailable={keyGuideAvailable}
      keyGuideEnabled={keyGuideEnabled}
      onKeyGuideToggle={onKeyGuideToggle}
    />
  );
}

function ActivePlaybackTransport({
  playback,
  navigation,
  drawerOpen,
  drawerToggleRef,
  onDrawerToggle,
  keyGuideAvailable,
  keyGuideEnabled,
  onKeyGuideToggle,
}: {
  playback: NonNullable<ViewerSessionHandle["playback"]>;
  navigation: ViewerSessionHandle["navigation"];
  drawerOpen: boolean;
  drawerToggleRef: RefObject<HTMLButtonElement | null>;
  onDrawerToggle(): void;
  keyGuideAvailable: boolean;
  keyGuideEnabled: boolean;
  onKeyGuideToggle(): void;
}) {
  const { t } = useTranslation("viewer");
  const state = usePlaybackSelector(playback, (snapshot) => snapshot);
  const view = presentPlayback(state);
  const seekScheduler = useMemo(() => createSeekPreviewScheduler(playback), [playback]);
  const dispatch = playback.dispatch;
  const position = (ratio: number) =>
    musicalPositionFromTick(
      Math.round(playback.timeline.durationTicks * ratio),
      playback.timeline.durationMs * ratio,
      playback.timeline,
    );

  useEffect(() => () => seekScheduler.destroy(), [seekScheduler]);
  useEffect(() => {
    if (state.soundFont !== "ready") return;
    const togglePlayback = (event: KeyboardEvent) => {
      if (
        event.key !== " " ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isInteractiveShortcutTarget(event.target)
      )
        return;
      event.preventDefault();
      void playback.dispatch({ type: "toggle-playback" });
    };
    window.addEventListener("keydown", togglePlayback);
    return () => window.removeEventListener("keydown", togglePlayback);
  }, [playback, state.soundFont]);

  const playLabel = view.isPlaying ? t("playback.pause") : t("playback.play");
  const audioStatusTone =
    view.audioStatusTone === "error" ? "danger" : view.audioStatusTone === "ready" ? "ready" : "neutral";
  return (
    <section className={styles.transportBar} aria-label={t("playback.controls")}>
      <div className={styles.transportActions}>
        <Button
          iconOnly
          className="tw:w-control"
          tone="primary"
          aria-label={playLabel}
          title={t("playback.shortcutTitle", { action: playLabel })}
          disabled={view.playDisabled}
          onClick={() => void dispatch({ type: "toggle-playback" })}
        >
          {view.isPlaying ? (
            <Pause className="tw:size-6" aria-hidden="true" />
          ) : (
            <Play className="tw:size-6" aria-hidden="true" />
          )}
        </Button>
        <IconButton
          size="sm"
          tone="ghost"
          aria-label={t("playback.stop")}
          title={t("playback.stopTitle")}
          disabled={view.stopDisabled}
          onClick={() => void dispatch({ type: "stop" })}
        >
          <Square className="tw:size-4" aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          tone="ghost"
          aria-label={t("playback.loopMode")}
          title={view.looping ? t("playback.closeLoopMode") : t("playback.openLoopMode")}
          pressed={view.looping}
          onClick={() => setPlaybackLoopMode(playback, state, !view.looping)}
        >
          <Repeat2 className="tw:size-4" aria-hidden="true" />
        </IconButton>
        <span className={styles.timeReadout}>
          {view.currentTime} / {view.duration}
        </span>
      </div>
      <div className={styles.transportProgress}>
        <Slider
          label={t("playback.progress")}
          variant="progress"
          max={1000}
          value={Math.round(view.progress * 1000)}
          onValueChange={(value) => seekScheduler.preview(position(value / 1000))}
          onValueCommitted={(value) => void seekScheduler.commit(position(value / 1000))}
        />
      </div>
      <div className={styles.transportTools}>
        {navigation ? <ScoreNavigationControls navigation={navigation} /> : null}
        <IconButton
          size="sm"
          tone="ghost"
          aria-label={t("playback.keyboardTaskTitle")}
          title={keyGuideEnabled ? t("playback.closeKeyboardHints") : t("playback.showKeyboardHints")}
          pressed={keyGuideEnabled}
          disabled={!keyGuideAvailable}
          onClick={onKeyGuideToggle}
        >
          <Piano className="tw:size-4" aria-hidden="true" />
        </IconButton>
        <div className={styles.transportSpeedControl}>
          <BpmControl
            baseTempo={view.baseTempo}
            currentTempo={view.currentTempo}
            speedPercent={view.speedPercent}
            onCommit={(tempo) => void dispatch({ type: "set-score-speed", speed: tempo / view.baseTempo })}
          />
        </div>
        {state.soundFont !== "ready" ? (
          <Status tone={audioStatusTone}>{audioStatusLabel(view.soundFont, t)}</Status>
        ) : null}
        {state.transport === "counting-in" ? (
          <p className={styles.countInStatus} role="status">
            {t("playback.countInStatus")}
          </p>
        ) : null}
        {view.soundFont === "error" ? (
          <button
            className={styles.transportRetry}
            type="button"
            onClick={() => void dispatch({ type: "retry-soundfont" })}
          >
            {t("playback.retryAudio")}
          </button>
        ) : null}
        <DrawerToggle buttonRef={drawerToggleRef} open={drawerOpen} onClick={onDrawerToggle} />
      </div>
    </section>
  );
}

function DisabledPlaybackTransport({
  drawerOpen,
  drawerToggleRef,
  onDrawerToggle,
}: {
  drawerOpen: boolean;
  drawerToggleRef: RefObject<HTMLButtonElement | null>;
  onDrawerToggle(): void;
}) {
  const { t } = useTranslation("viewer");
  return (
    <section className={styles.transportBar} aria-label={t("playback.controls")}>
      <div className={styles.transportActions}>
        <Button
          iconOnly
          className="tw:w-control"
          tone="primary"
          aria-label={t("playback.play")}
          title={t("playback.shortcutTitle", { action: t("playback.play") })}
          disabled
        >
          <Play className="tw:size-6" aria-hidden="true" />
        </Button>
        <IconButton size="sm" tone="ghost" aria-label={t("playback.stop")} title={t("playback.stopTitle")} disabled>
          <Square className="tw:size-4" aria-hidden="true" />
        </IconButton>
        <IconButton size="sm" tone="ghost" aria-label={t("playback.loopMode")} disabled>
          <Repeat2 className="tw:size-4" aria-hidden="true" />
        </IconButton>
        <span className={styles.timeReadout}>0:00 / 0:00</span>
      </div>
      <div className={styles.transportProgress}>
        <Slider label={t("playback.progress")} variant="progress" max={1000} value={0} disabled />
      </div>
      <div className={styles.transportTools}>
        <div className={styles.transportSpeedControl}>
          <BpmControl baseTempo={120} currentTempo={120} speedPercent={100} disabled />
        </div>
        <Status tone="neutral">{t("playback.audio.loading")}</Status>
        <DrawerToggle buttonRef={drawerToggleRef} open={drawerOpen} onClick={onDrawerToggle} />
      </div>
    </section>
  );
}

function DrawerToggle({
  buttonRef,
  open,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClick(): void;
}) {
  const { t } = useTranslation("viewer");
  return (
    <button
      className={styles.drawerToggle}
      ref={buttonRef}
      type="button"
      aria-label={open ? t("playback.collapsePractice") : t("playback.practice")}
      aria-controls="practice-drawer"
      aria-expanded={open}
      onClick={onClick}
    >
      <SlidersHorizontal aria-hidden="true" />
      <span>{open ? t("playback.collapsePractice") : t("playback.practice")}</span>
    </button>
  );
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-shortcuts-disabled]',
      ),
    )
  );
}
