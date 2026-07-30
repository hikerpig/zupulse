import { musicalPositionFromTick } from "@zupulse/web-core";
import type { PlaybackCommand, PlaybackState, PianoHandMode } from "@zupulse/web-core";
import { Popover } from "@base-ui/react/popover";
import {
  BookOpen,
  Check as CheckIcon,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Pause,
  Play,
  Repeat2,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ViewerSessionHandle } from "../host";
import { presentPlayback, type PlaybackViewModel } from "../playbackPresenter";
import { Slider } from "../components/Slider";
import { ContextPopup } from "../components/ContextPopup";
import { Button, IconButton } from "../components/ui";
import { persistScoreNavigationMode, useAppStore } from "../app/appStore";
import styles from "./PlaybackWorkspace.module.css";

type PracticeView = "overview" | "rhythm" | "hands" | "loop" | "tracks";

export function PlaybackWorkspace({
  session,
  children,
}: {
  session: ViewerSessionHandle | undefined;
  children: ReactNode;
}) {
  return (
    <PlaybackLayout playback={session?.playback} navigation={session?.navigation}>
      {children}
    </PlaybackLayout>
  );
}

function PlaybackLayout({
  playback,
  navigation,
  children,
}: {
  playback: ViewerSessionHandle["playback"];
  navigation: ViewerSessionHandle["navigation"];
  children: ReactNode;
}) {
  const { t } = useTranslation("viewer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [practiceView, setPracticeView] = useState<PracticeView>("overview");
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);
  const seekScheduler = useMemo(() => (playback ? createSeekPreviewScheduler(playback) : undefined), [playback]);
  const state = useSyncExternalStore(
    (listener) => playback?.subscribe(() => listener()) ?? (() => undefined),
    () => playback?.getState() ?? null,
  );
  useEffect(() => () => seekScheduler?.destroy(), [seekScheduler]);
  useEffect(() => {
    if (drawerOpen) {
      drawerCloseRef.current?.focus();
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setDrawerOpen(false);
      };
      window.addEventListener("keydown", closeOnEscape);
      wasDrawerOpen.current = true;
      return () => window.removeEventListener("keydown", closeOnEscape);
    }
    if (wasDrawerOpen.current) drawerToggleRef.current?.focus();
    wasDrawerOpen.current = false;
    return undefined;
  }, [drawerOpen]);
  useEffect(() => {
    if (!playback || state?.soundFont !== "ready") return;
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
  }, [playback, state?.soundFont]);
  if (!playback || !state)
    return disabledPlaybackWorkspace(children, drawerOpen, setDrawerOpen, drawerToggleRef, drawerCloseRef, t);
  const view = presentPlayback(state);
  const dispatch = (command: PlaybackCommand) => void playback.dispatch(command);
  const hasPlayableLoop =
    view.loops.some((loop) => loop.selected) ||
    Boolean(state.loopDraft.start && state.loopDraft.end && state.loopDraft.start.tick < state.loopDraft.end.tick);
  const playLabel = view.isPlaying ? t("playback.pause") : t("playback.play");
  const activeLoop = view.loops.find((loop) => loop.selected);
  const activeLoopState = state.loops.find((loop) => loop.id === state.activeLoopId);
  const position = (ratio: number) =>
    musicalPositionFromTick(
      Math.round(playback.timeline.durationTicks * ratio),
      playback.timeline.durationMs * ratio,
      playback.timeline,
    );
  const setLoopMode = (enabled: boolean) => {
    if (enabled === view.looping) return;
    if (!enabled || hasPlayableLoop) {
      dispatch({ type: "set-loop-enabled", enabled });
      return;
    }
    initializeLoopDraft(playback, state, activeLoopState);
  };
  const openLoopEditor = () => {
    setLoopMode(true);
    setPracticeView("loop");
    setDrawerOpen(true);
  };

  return (
    <>
      <section className={styles.transportBar} aria-label={t("playback.controls")}>
        <div className={styles.transportActions}>
          <Button
            iconOnly
            className="tw:w-control"
            tone="primary"
            aria-label={playLabel}
            title={t("playback.shortcutTitle", { action: playLabel })}
            disabled={view.playDisabled}
            onClick={() => dispatch({ type: "toggle-playback" })}
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
            onClick={() => dispatch({ type: "stop" })}
          >
            <Square className="tw:size-4" aria-hidden="true" />
          </IconButton>
          <span className={styles.keyWithLed}>
            <IconButton
              size="sm"
              tone="ghost"
              aria-label={t("playback.loopMode")}
              title={view.looping ? t("playback.closeLoopMode") : t("playback.openLoopMode")}
              pressed={view.looping}
              onClick={() => setLoopMode(!view.looping)}
            >
              <Repeat2 className="tw:size-4" aria-hidden="true" />
            </IconButton>
            <span className={styles.ledDot} data-active={view.looping || undefined} aria-hidden="true" />
          </span>
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
            onValueChange={(value) => seekScheduler?.preview(position(value / 1000))}
            onValueCommitted={(value) => void seekScheduler?.commit(position(value / 1000))}
          />
        </div>
        <div className={styles.transportTools}>
          {navigation ? <ScoreNavigationControls navigation={navigation} /> : null}
          <div className={styles.transportSpeedControl}>
            <BpmControl
              baseTempo={view.baseTempo}
              currentTempo={view.currentTempo}
              speedPercent={view.speedPercent}
              onCommit={(tempo) => dispatch({ type: "set-score-speed", speed: tempo / view.baseTempo })}
            />
          </div>
          {state.soundFont !== "ready" && (
            <p className={`${styles.statusChip} ${styles[view.audioStatusTone]}`}>
              {audioStatusLabel(view.soundFont, t)}
            </p>
          )}
          {state.transport === "counting-in" ? (
            <p className={styles.countInStatus} role="status">
              {t("playback.countInStatus")}
            </p>
          ) : null}
          {view.soundFont === "error" && (
            <button
              className={styles.transportRetry}
              type="button"
              onClick={() => dispatch({ type: "retry-soundfont" })}
            >
              {t("playback.retryAudio")}
            </button>
          )}
          <DrawerToggle
            buttonRef={drawerToggleRef}
            open={drawerOpen}
            onClick={() => {
              if (!drawerOpen) setPracticeView("overview");
              setDrawerOpen((open) => !open);
            }}
          />
        </div>
      </section>
      <section className={styles.workspace}>
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
            <div className={styles.drawerHeader}>
              <div>
                {practiceView !== "overview" ? (
                  <button
                    autoFocus
                    className={styles.drawerBack}
                    type="button"
                    onClick={() => setPracticeView("overview")}
                  >
                    <ChevronLeft aria-hidden="true" />
                    {t("playback.backToPractice")}
                  </button>
                ) : null}
                <h2 className={styles.drawerTitle}>
                  {practiceView === "loop"
                    ? t("playback.loopTaskTitle")
                    : practiceView === "rhythm"
                      ? t("playback.rhythmTaskTitle")
                      : practiceView === "hands"
                        ? t("playback.handTaskTitle")
                        : practiceView === "tracks"
                          ? t("playback.trackTaskTitle")
                          : t("playback.practice")}
                </h2>
                {practiceView === "overview" ? (
                  <p className={styles.drawerSummary}>
                    {t("playback.summary", {
                      track: view.primaryTrackName ?? t("playback.noSelection"),
                      count: view.trackCount,
                      speed: view.speedPercent,
                    })}
                  </p>
                ) : null}
              </div>
              <button
                ref={drawerCloseRef}
                className={styles.drawerClose}
                type="button"
                aria-label={t("playback.closePractice")}
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.panelShell}>
              {practiceView === "overview" ? (
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
                        onCommit={(tempo) => dispatch({ type: "set-score-speed", speed: tempo / view.baseTempo })}
                      />
                      {view.soundFont === "error" ? (
                        <button type="button" onClick={() => dispatch({ type: "retry-soundfont" })}>
                          {t("playback.retryAudio")}
                        </button>
                      ) : null}
                    </div>
                  </section>
                  <div className={styles.taskList}>
                    <button className={styles.taskEntry} type="button" onClick={() => setPracticeView("rhythm")}>
                      <span>
                        <strong>{t("playback.rhythmTaskTitle")}</strong>
                        <small>{rhythmSummary(state.rhythm.metronome.enabled, state.rhythm.countIn.enabled, t)}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <button className={styles.taskEntry} type="button" onClick={() => setPracticeView("hands")}>
                      <span>
                        <strong>{t("playback.handTaskTitle")}</strong>
                        <small>{pianoPracticeSummary(state.pianoPractice, t)}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <button className={styles.taskEntry} type="button" onClick={openLoopEditor}>
                      <span>
                        <strong>{t("playback.loopTaskTitle")}</strong>
                        <small>
                          {activeLoop ? loopDisplayLabel(activeLoop, t) : t("playback.loopTaskDescription")}
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <button className={styles.taskEntry} type="button" onClick={() => setPracticeView("tracks")}>
                      <span>
                        <strong>{t("playback.trackTaskTitle")}</strong>
                        <small>
                          {view.primaryTrackName
                            ? t("playback.primaryTrackSummary", { track: view.primaryTrackName })
                            : t("playback.trackTaskDescription")}
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : null}
              {practiceView === "rhythm" ? (
                <section className={styles.panelSection}>
                  <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>{t("playback.rhythmTaskTitle")}</p>
                  </div>
                  <div className={styles.panelContent}>
                    <RhythmSetting
                      label={t("playback.metronome")}
                      volumeLabel={t("playback.metronomeVolume")}
                      setting={state.rhythm.metronome}
                      disabled={state.soundFont !== "ready"}
                      disabledReason={audioStatusLabel(state.soundFont, t)}
                      onEnabledChange={(enabled) => dispatch({ type: "set-metronome", enabled })}
                      onVolumeChange={(volume) => dispatch({ type: "set-metronome-volume", volume })}
                    />
                    <RhythmSetting
                      label={t("playback.countIn")}
                      volumeLabel={t("playback.countInVolume")}
                      setting={state.rhythm.countIn}
                      disabled={state.soundFont !== "ready"}
                      disabledReason={audioStatusLabel(state.soundFont, t)}
                      onEnabledChange={(enabled) => dispatch({ type: "set-count-in", enabled })}
                      onVolumeChange={(volume) => dispatch({ type: "set-count-in-volume", volume })}
                    />
                    {state.transport === "counting-in" ? (
                      <p className={styles.inlineStatus} role="status">
                        {t("playback.countInStatus")}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {practiceView === "hands" ? (
                <section className={styles.panelSection}>
                  <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>{t("playback.handTaskTitle")}</p>
                  </div>
                  <div className={styles.panelContent}>
                    <fieldset className={styles.handModes} disabled={state.pianoPractice.availability !== "available"}>
                      <legend>{t("playback.handMode")}</legend>
                      {(["both-hands", "right-hand", "left-hand"] as const).map((mode) => (
                        <label key={mode}>
                          <input
                            type="radio"
                            name="piano-hand-mode"
                            checked={state.pianoPractice.mode === mode}
                            onChange={() => dispatch({ type: "set-piano-hand-mode", mode })}
                          />
                          <span
                            className={styles.ledDot}
                            data-active={state.pianoPractice.mode === mode || undefined}
                            aria-hidden="true"
                          />
                          <span>{pianoHandModeLabel(mode, t)}</span>
                        </label>
                      ))}
                    </fieldset>
                    {state.pianoPractice.unavailableCode ? (
                      <p className={styles.inlineStatus} role="status">
                        {pianoUnavailableReason(state.pianoPractice.unavailableCode, t)}
                      </p>
                    ) : null}
                    {state.pianoPractice.availability === "available" && state.pianoPractice.mode !== "both-hands" ? (
                      <button
                        className={styles.handPreview}
                        type="button"
                        aria-pressed={state.pianoPractice.previewActive}
                        onClick={() =>
                          dispatch({
                            type: "preview-piano-target-hand",
                            active: !state.pianoPractice.previewActive,
                          })
                        }
                      >
                        {t(
                          state.pianoPractice.previewActive ? "playback.stopHandPreview" : "playback.previewTargetHand",
                        )}
                      </button>
                    ) : null}
                    {state.pianoPractice.pausedForAudioProjection ? (
                      <p className={styles.inlineStatus} role="status">
                        {t("playback.handProjectionPaused")}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {practiceView === "loop" ? (
                <section className={styles.panelSection}>
                  <div className={styles.panelHeader}>
                    <label className={styles.loopModeRow}>
                      <span className={styles.panelTitle}>{t("playback.loopMode")}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={view.looping}
                        onChange={(event) => setLoopMode(event.currentTarget.checked)}
                      />
                    </label>
                  </div>
                  <div className={styles.panelContent}>
                    {view.looping ? (
                      <>
                        <button type="button" onClick={() => dispatch({ type: "save-loop" })}>
                          {t("playback.saveLoop")}
                        </button>
                        <label>
                          <span>{t("playback.snap")}</span>
                          <select
                            value={view.loopSnapMode}
                            onChange={(event) =>
                              dispatch({
                                type: "set-loop-snap",
                                mode: event.currentTarget.value as typeof view.loopSnapMode,
                              })
                            }
                          >
                            <option value="off">{t("playback.snapOff")}</option>
                            <option value="beat">{t("playback.snapBeat")}</option>
                            <option value="measure">{t("playback.snapMeasure")}</option>
                          </select>
                        </label>
                      </>
                    ) : (
                      <p className={styles.loopModeHint}>{t("playback.loopModeHint")}</p>
                    )}
                    <div className={styles.itemList}>
                      {view.loops.map((loop) => (
                        <div className={styles.loopRow} key={loop.id}>
                          <button type="button" onClick={() => dispatch({ type: "select-loop", loopId: loop.id })}>
                            {loop.selected ? t("playback.current") : t("playback.select")}
                          </button>
                          <input
                            aria-label={t("playback.loopName")}
                            value={loopDisplayLabel(loop, t)}
                            onChange={(event) =>
                              dispatch({
                                type: "rename-loop",
                                loopId: loop.id,
                                label: event.currentTarget.value,
                              })
                            }
                          />
                          <span>
                            {t("playback.measureRange", {
                              start: loop.startMeasureIndex + 1,
                              end: loop.endMeasureIndex + 1,
                            })}
                          </span>
                          <input
                            type="number"
                            min="25"
                            max="200"
                            step="5"
                            value={loop.speedPercent ?? ""}
                            placeholder={t("playback.defaultSpeed")}
                            aria-label={t("playback.loopSpeed")}
                            onChange={(event) => dispatch(loopSpeedCommand(loop.id, event.currentTarget.value))}
                          />
                          <button type="button" onClick={() => dispatch({ type: "delete-loop", loopId: loop.id })}>
                            {t("playback.delete")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
              {practiceView === "tracks" ? (
                <section className={styles.panelSection}>
                  <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>{t("playback.tracks")}</p>
                  </div>
                  <div className={`${styles.panelContent} ${styles.itemList}`}>
                    {view.tracks.map((track) => (
                      <div className={styles.trackRow} key={track.id}>
                        <strong>{trackDisplayName(track, t)}</strong>
                        <Check
                          label={t("playback.primary")}
                          type="radio"
                          name="primary-track"
                          checked={track.primary}
                          onChange={() => dispatch({ type: "set-primary-track", trackId: track.id })}
                        />
                        <Check
                          label={t("playback.visible")}
                          checked={track.additional}
                          onChange={(checked) =>
                            dispatch({
                              type: "set-additional-tracks",
                              trackIds: checked
                                ? [...new Set([...state.trackState.additionalVisibleTrackIds, track.id])]
                                : state.trackState.additionalVisibleTrackIds.filter((id) => id !== track.id),
                            })
                          }
                        />
                        <Check
                          label={t("playback.mute")}
                          checked={track.muted}
                          onChange={(muted) => dispatch({ type: "set-track-mute", trackId: track.id, muted })}
                        />
                        <Check
                          label={t("playback.solo")}
                          checked={track.solo}
                          onChange={(solo) => dispatch({ type: "set-track-solo", trackId: track.id, solo })}
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={track.volumePercent}
                          aria-label={t("playback.volume", { track: trackDisplayName(track, t) })}
                          onChange={(event) =>
                            dispatch({
                              type: "set-track-volume",
                              trackId: track.id,
                              volume: Number(event.currentTarget.value) / 100,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
            <p className={styles.persistenceStatus} aria-live="polite">
              {persistenceMessage(view.persistence, t)}
            </p>
          </aside>
        )}
      </section>
    </>
  );
}

function initializeLoopDraft(
  playback: NonNullable<ViewerSessionHandle["playback"]>,
  state: ReturnType<NonNullable<ViewerSessionHandle["playback"]>["getState"]>,
  activeLoop: (typeof state.loops)[number] | undefined,
): void {
  if (state.loopDraft.start && state.loopDraft.end) return;
  const measure =
    playback.timeline.measures.find((item) => item.index === state.position.measureIndex) ??
    playback.timeline.measures[0];
  if (!measure && !activeLoop) return;
  const start =
    activeLoop?.start ??
    musicalPositionFromTick(
      measure!.startTick,
      (measure!.startTick / Math.max(1, playback.timeline.durationTicks)) * playback.timeline.durationMs,
      playback.timeline,
    );
  const endTick =
    activeLoop?.end.tick ?? Math.min(playback.timeline.durationTicks, measure!.startTick + measure!.durationTicks);
  const end =
    activeLoop?.end ??
    musicalPositionFromTick(
      endTick,
      (endTick / Math.max(1, playback.timeline.durationTicks)) * playback.timeline.durationMs,
      playback.timeline,
    );
  if (!state.loopDraft.start) {
    void playback.dispatch({ type: "set-loop-boundary", boundary: "start", position: start });
  }
  if (!state.loopDraft.end) {
    void playback.dispatch({ type: "set-loop-boundary", boundary: "end", position: end });
  }
  if (!activeLoop) {
    void playback.dispatch({ type: "commit-loop-draft" });
  }
}

function ScoreNavigationControls({ navigation }: { navigation: NonNullable<ViewerSessionHandle["navigation"]> }) {
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

type SeekPlayback = Pick<NonNullable<ViewerSessionHandle["playback"]>, "dispatch" | "previewSeek">;

export function createSeekPreviewScheduler(
  playback: SeekPlayback,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
) {
  let frame: number | undefined;
  let pending: Extract<PlaybackCommand, { type: "seek" }>["position"] | undefined;

  const cancelPendingFrame = () => {
    if (frame === undefined) return;
    cancelFrame(frame);
    frame = undefined;
  };

  return {
    preview(position: Extract<PlaybackCommand, { type: "seek" }>["position"]) {
      pending = position;
      if (frame !== undefined) return;
      frame = requestFrame(() => {
        frame = undefined;
        const next = pending;
        pending = undefined;
        if (next) playback.previewSeek?.(next);
      });
    },
    commit(position: Extract<PlaybackCommand, { type: "seek" }>["position"]) {
      cancelPendingFrame();
      pending = undefined;
      return playback.dispatch({ type: "seek", position });
    },
    destroy() {
      cancelPendingFrame();
      pending = undefined;
    },
  };
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

function Check({
  label,
  checked,
  onChange,
  type = "checkbox",
  name,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label className={styles.trackOption} data-control-type={type}>
      <input
        className={styles.trackOptionInput}
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className={styles.trackOptionIndicator} aria-hidden="true">
        {type === "checkbox" ? <CheckIcon className={styles.trackOptionCheck} strokeWidth={3} /> : null}
      </span>
      <span className={styles.trackOptionLabel}>{label}</span>
    </label>
  );
}

function disabledPlaybackWorkspace(
  children: ReactNode,
  drawerOpen: boolean,
  setDrawerOpen: (open: boolean) => void,
  drawerToggleRef: RefObject<HTMLButtonElement | null>,
  drawerCloseRef: RefObject<HTMLButtonElement | null>,
  t: TFunction<"viewer">,
) {
  return (
    <>
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
          <span className={styles.keyWithLed}>
            <IconButton size="sm" tone="ghost" aria-label={t("playback.loopMode")} disabled>
              <Repeat2 className="tw:size-4" aria-hidden="true" />
            </IconButton>
            <span className={styles.ledDot} aria-hidden="true" />
          </span>
          <span className={styles.timeReadout}>0:00 / 0:00</span>
        </div>
        <div className={styles.transportProgress}>
          <Slider label={t("playback.progress")} variant="progress" max={1000} value={0} disabled />
        </div>
        <div className={styles.transportTools}>
          <div className={styles.transportSpeedControl}>
            <BpmControl baseTempo={120} currentTempo={120} speedPercent={100} disabled />
          </div>
          <p className="status-chip subtle">{t("playback.audio.loading")}</p>
          <DrawerToggle buttonRef={drawerToggleRef} open={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} />
        </div>
      </section>
      <section className={styles.workspace}>
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
            <div className={styles.drawerHeader}>
              <div>
                <h2 className={styles.drawerTitle}>{t("playback.practice")}</h2>
              </div>
              <button
                ref={drawerCloseRef}
                className={styles.drawerClose}
                type="button"
                aria-label={t("playback.closePractice")}
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.panelShell}>
              <section className={styles.panelSection}>
                <div className={styles.panelHeader}>
                  <p className={styles.panelTitle}>{t("playback.speedTitle")}</p>
                </div>
                <div className={styles.panelContent}>
                  <BpmControl baseTempo={120} currentTempo={120} speedPercent={100} disabled />
                </div>
              </section>
              <div className={styles.taskList}>
                {[
                  t("playback.rhythmTaskTitle"),
                  t("playback.handTaskTitle"),
                  t("playback.loopTaskTitle"),
                  t("playback.trackTaskTitle"),
                ].map((title) => (
                  <button className={styles.taskEntry} type="button" key={title} disabled>
                    <span>
                      <strong>{title}</strong>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.persistenceStatus}>{t("playback.disabledHint")}</p>
          </aside>
        )}
      </section>
    </>
  );
}

function RhythmSetting({
  label,
  volumeLabel,
  setting,
  disabled,
  disabledReason,
  onEnabledChange,
  onVolumeChange,
}: {
  label: string;
  volumeLabel: string;
  setting: { enabled: boolean; volume: number };
  disabled: boolean;
  disabledReason: string;
  onEnabledChange(enabled: boolean): void;
  onVolumeChange(volume: number): void;
}) {
  return (
    <div className={styles.rhythmSetting}>
      <label className={styles.loopModeRow}>
        <span className={styles.panelTitle}>{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={setting.enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
        />
      </label>
      <label className={styles.rhythmVolume}>
        <span>{volumeLabel}</span>
        <output>{setting.volume}%</output>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={setting.volume}
          disabled={disabled}
          aria-label={volumeLabel}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
        />
      </label>
      {disabled ? <small className={styles.disabledReason}>{disabledReason}</small> : null}
    </div>
  );
}

function rhythmSummary(metronome: boolean, countIn: boolean, t: TFunction<"viewer">): string {
  if (metronome && countIn) return t("playback.rhythmBothEnabled");
  if (metronome) return t("playback.metronomeEnabled");
  if (countIn) return t("playback.countInEnabled");
  return t("playback.rhythmDisabled");
}

function pianoPracticeSummary(state: PlaybackState["pianoPractice"], t: TFunction<"viewer">): string {
  if (state.availability !== "available") {
    return state.unavailableCode ? pianoUnavailableReason(state.unavailableCode, t) : t("playback.handUnavailable");
  }
  return pianoHandModeLabel(state.mode, t);
}

function pianoHandModeLabel(mode: PianoHandMode, t: TFunction<"viewer">): string {
  if (mode === "right-hand") return t("playback.practiceRightHand");
  if (mode === "left-hand") return t("playback.practiceLeftHand");
  return t("playback.bothHandsDemo");
}

function pianoUnavailableReason(
  code:
    "piano-hand-practice-not-applicable" | "piano-hand-practice-ambiguous" | "piano-hand-practice-audio-unsupported",
  t: TFunction<"viewer">,
): string {
  if (code === "piano-hand-practice-ambiguous") return t("playback.handAmbiguous");
  if (code === "piano-hand-practice-audio-unsupported") return t("playback.handAudioUnsupported");
  return t("playback.handNotApplicable");
}

function BpmControl({
  baseTempo,
  currentTempo,
  speedPercent,
  disabled = false,
  onCommit,
}: {
  baseTempo: number;
  currentTempo: number;
  speedPercent: number;
  disabled?: boolean;
  onCommit?(tempo: number): void;
}) {
  const { t } = useTranslation("viewer");
  const presets = [1, 0.75, 0.5, 0.25];
  return (
    <Popover.Root>
      <Popover.Trigger
        className={styles.speedTrigger}
        aria-label={t("playback.speedLabel", { tempo: currentTempo, percent: speedPercent })}
        disabled={disabled}
      >
        <strong>{currentTempo}</strong>
        <span>BPM · {speedPercent}%</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="center" sideOffset={10} className={styles.speedPopoverPositioner}>
          <Popover.Popup className={styles.speedPopover} data-shortcuts-disabled>
            <Popover.Title className="sr-only">{t("playback.speedTitle")}</Popover.Title>
            <label className={styles.speedInput}>
              <span className="sr-only">{t("playback.speedBpm")}</span>
              <input
                key={currentTempo}
                type="number"
                aria-label={t("playback.speedBpm")}
                min={Math.round(baseTempo * 0.25)}
                max={Math.round(baseTempo * 2)}
                step="1"
                defaultValue={currentTempo}
                onBlur={(event) => {
                  const tempo = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(tempo)) onCommit?.(tempo);
                  else event.currentTarget.value = String(currentTempo);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <span>BPM</span>
            </label>
            <div className={styles.speedPresets}>
              {presets.map((speed) => {
                const tempo = Math.round(baseTempo * speed);
                const label = `${Math.round(speed * 100)}%（${tempo} BPM）`;
                return (
                  <button
                    key={speed}
                    className={styles.menuOption}
                    type="button"
                    aria-label={label}
                    aria-pressed={currentTempo === tempo}
                    onClick={() => onCommit?.(tempo)}
                  >
                    <strong>{Math.round(speed * 100)}%</strong>
                    <span>{tempo} BPM</span>
                  </button>
                );
              })}
            </div>
            <Popover.Arrow className={styles.speedPopoverArrow} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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

function loopSpeedCommand(loopId: string, value: string): PlaybackCommand {
  return value === ""
    ? { type: "set-loop-speed", loopId }
    : { type: "set-loop-speed", loopId, speed: Number(value) / 100 };
}

function loopDisplayLabel(loop: PlaybackViewModel["loops"][number], t: TFunction<"viewer">): string {
  return loop.labelSource === "user" && loop.label
    ? loop.label
    : t("playback.measureRange", {
        start: loop.startMeasureIndex + 1,
        end: loop.endMeasureIndex + 1,
      });
}

function trackDisplayName(track: PlaybackViewModel["tracks"][number], t: TFunction<"viewer">): string {
  return track.name ?? t("playback.trackFallback", { number: track.sourceIndex + 1 });
}

function persistenceMessage(state: PlaybackViewModel["persistence"], t: TFunction<"viewer">): string {
  if (state === "saving") return t("playback.persistenceSaving");
  if (state === "unsaved" || state === "error") return t("playback.persistenceUnsaved");
  return "";
}

function audioStatusLabel(soundFont: PlaybackViewModel["soundFont"], t: TFunction<"viewer">): string {
  if (soundFont === "ready") return t("playback.audio.ready");
  if (soundFont === "error") return t("playback.audio.error");
  return t("playback.audio.loading");
}
