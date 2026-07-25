import { musicalPositionFromTick } from "@zupulse/web-core";
import type { PlaybackCommand } from "@zupulse/web-core";
import { Popover } from "@base-ui/react/popover";
import { BookOpen, ChevronLeft, ChevronRight, LocateFixed, Pause, Play, Repeat2, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ViewerSessionHandle } from "../host";
import { presentPlayback, type PlaybackViewModel } from "../playbackPresenter";
import { Slider } from "../components/Slider";
import { ContextPopup } from "../components/ContextPopup";
import { persistScoreNavigationMode, useAppStore } from "../app/appStore";
import styles from "./PlaybackWorkspace.module.css";

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
  const seekScheduler = useMemo(() => (playback ? createSeekPreviewScheduler(playback) : undefined), [playback]);
  const state = useSyncExternalStore(
    (listener) => playback?.subscribe(() => listener()) ?? (() => undefined),
    () => playback?.getState() ?? null,
  );
  useEffect(() => () => seekScheduler?.destroy(), [seekScheduler]);
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
  if (!playback || !state) return disabledPlaybackWorkspace(children, drawerOpen, setDrawerOpen, t);
  const view = presentPlayback(state);
  const dispatch = (command: PlaybackCommand) => void playback.dispatch(command);
  const hasActiveLoop = view.loops.some((loop) => loop.selected);
  const playLabel = view.isPlaying ? t("playback.pause") : t("playback.play");
  const activeLoop = view.loops.find((loop) => loop.selected);
  const position = (ratio: number) =>
    musicalPositionFromTick(
      Math.round(playback.timeline.durationTicks * ratio),
      playback.timeline.durationMs * ratio,
      playback.timeline,
    );

  return (
    <>
      <section className={styles.transportBar} aria-label={t("playback.controls")}>
        <div className={styles.transportActions}>
          <button
            className={`primary-button ${styles.transportPlayButton}`}
            type="button"
            aria-label={playLabel}
            title={t("playback.shortcutTitle", { action: playLabel })}
            disabled={view.playDisabled}
            onClick={() => dispatch({ type: "toggle-playback" })}
          >
            {view.isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button
            className={styles.transportIconButton}
            type="button"
            aria-label={t("playback.stop")}
            title={t("playback.stopTitle")}
            disabled={view.stopDisabled}
            onClick={() => dispatch({ type: "stop" })}
          >
            <Square aria-hidden="true" />
          </button>
          <button
            className={styles.transportIconButton}
            type="button"
            aria-label={
              hasActiveLoop
                ? view.looping
                  ? t("playback.disableLoop")
                  : t("playback.enableLoop")
                : t("playback.setLoop")
            }
            title={
              hasActiveLoop
                ? view.looping
                  ? t("playback.disableLoop")
                  : t("playback.enableLoop")
                : t("playback.setLoop")
            }
            aria-pressed={view.looping}
            onClick={() =>
              hasActiveLoop ? dispatch({ type: "set-loop-enabled", enabled: !view.looping }) : setDrawerOpen(true)
            }
          >
            <Repeat2 aria-hidden="true" />
          </button>
          <span className={styles.timeReadout}>
            {view.currentTime} / {view.duration}
          </span>
        </div>
        <div className={styles.transportDivider} aria-hidden="true" />
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
          <BpmControl
            baseTempo={view.baseTempo}
            currentTempo={view.currentTempo}
            speedPercent={view.speedPercent}
            onCommit={(tempo) => dispatch({ type: "set-score-speed", speed: tempo / view.baseTempo })}
          />
          {state.soundFont !== "ready" && (
            <p className={`${styles.statusChip} ${styles[view.audioStatusTone]}`}>
              {audioStatusLabel(view.soundFont, t)}
            </p>
          )}
          {view.soundFont === "error" && (
            <button type="button" onClick={() => dispatch({ type: "retry-soundfont" })}>
              {t("playback.retryAudio")}
            </button>
          )}
          <DrawerToggle open={drawerOpen} onClick={() => setDrawerOpen((open) => !open)} />
        </div>
      </section>
      <section className={styles.workspace}>
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.drawerKicker}>{t("playback.practiceKicker")}</p>
                <h2 className={styles.drawerTitle}>{t("playback.practice")}</h2>
                <p className={styles.drawerSummary}>
                  {t("playback.summary", {
                    track: view.primaryTrackName ?? t("playback.noSelection"),
                    count: view.trackCount,
                    speed: view.speedPercent,
                  })}
                </p>
              </div>
              <button
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
                  <p className={styles.panelTitle}>{t("playback.loop")}</p>
                  <label className={styles.toggleRow}>
                    <input
                      type="checkbox"
                      checked={view.looping}
                      onChange={(event) => dispatch({ type: "set-loop-enabled", enabled: event.currentTarget.checked })}
                    />
                    <span>{t("playback.enableLoop")}</span>
                  </label>
                </div>
                <div className={styles.panelContent}>
                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "set-loop-boundary",
                          boundary: "start",
                          position: state.position,
                        })
                      }
                    >
                      {t("playback.setA")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "set-loop-boundary",
                          boundary: "end",
                          position: state.position,
                        })
                      }
                    >
                      {t("playback.setB")}
                    </button>
                    <button type="button" onClick={() => dispatch({ type: "save-loop" })}>
                      {t("playback.saveLoop")}
                    </button>
                  </div>
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
                  <label>
                    <span>{t("playback.pointA")}</span>
                    <Slider
                      label={t("playback.loopPointA")}
                      max={1000}
                      value={loopValue(state.loopDraft.start?.tick, playback.timeline.durationTicks)}
                      onValueChange={(value) =>
                        dispatch({
                          type: "set-loop-boundary",
                          boundary: "start",
                          position: position(value / 1000),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{t("playback.pointB")}</span>
                    <Slider
                      label={t("playback.loopPointB")}
                      max={1000}
                      value={loopValue(state.loopDraft.end?.tick, playback.timeline.durationTicks)}
                      onValueChange={(value) =>
                        dispatch({
                          type: "set-loop-boundary",
                          boundary: "end",
                          position: position(value / 1000),
                        })
                      }
                    />
                  </label>
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
              <section className={styles.panelSection}>
                <div className={styles.panelHeader}>
                  <p className={styles.panelTitle}>{t("playback.session")}</p>
                </div>
                <div className="panel-content session-facts">
                  {[
                    { label: t("playback.factTracks"), value: String(view.trackCount) },
                    { label: t("playback.factTempo"), value: `${view.speedPercent}%` },
                    {
                      label: t("playback.factLoop"),
                      value: activeLoop ? loopDisplayLabel(activeLoop, t) : t("playback.loopDisabled"),
                    },
                    {
                      label: t("playback.factPrimary"),
                      value: view.primaryTrackName ?? t("playback.noSelection"),
                    },
                  ].map((fact) => (
                    <div className={styles.sessionFact} key={fact.label}>
                      <span className={styles.sessionFactLabel}>{fact.label}</span>
                      <strong className={styles.sessionFactValue}>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
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
          <button type="button" aria-pressed={mode === "continuous"} onClick={() => chooseMode("continuous")}>
            {t("score.continuous")}
          </button>
          <button type="button" aria-pressed={mode === "page-turn"} onClick={() => chooseMode("page-turn")}>
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
    <label>
      <input type={type} name={name} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

function disabledPlaybackWorkspace(
  children: ReactNode,
  drawerOpen: boolean,
  setDrawerOpen: (open: boolean) => void,
  t: TFunction<"viewer">,
) {
  return (
    <>
      <section className={styles.transportBar} aria-label={t("playback.controls")}>
        <div className={styles.transportActions}>
          <button
            className="primary-button transport-play-button"
            type="button"
            aria-label={t("playback.play")}
            title={t("playback.shortcutTitle", { action: t("playback.play") })}
            disabled
          >
            <Play aria-hidden="true" />
          </button>
          <button
            className={styles.transportIconButton}
            type="button"
            aria-label={t("playback.stop")}
            title={t("playback.stopTitle")}
            disabled
          >
            <Square aria-hidden="true" />
          </button>
          <button className={styles.transportIconButton} type="button" aria-label={t("playback.setLoop")} disabled>
            <Repeat2 aria-hidden="true" />
          </button>
          <span className={styles.timeReadout}>0:00 / 0:00</span>
        </div>
        <div className={styles.transportDivider} aria-hidden="true" />
        <div className={styles.transportProgress}>
          <Slider label={t("playback.progress")} variant="progress" max={1000} value={0} disabled />
        </div>
        <div className={styles.transportTools}>
          <BpmControl baseTempo={120} currentTempo={120} speedPercent={100} disabled />
          <p className="status-chip subtle">{t("playback.audio.loading")}</p>
          <DrawerToggle open={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} />
        </div>
      </section>
      <section className={styles.workspace}>
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.drawerKicker}>{t("playback.practiceKicker")}</p>
                <h2 className={styles.drawerTitle}>{t("playback.practice")}</h2>
              </div>
              <button
                className={styles.drawerClose}
                type="button"
                aria-label={t("playback.closePractice")}
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.panelShell}>
              {[t("playback.loop"), t("playback.tracks"), t("playback.session")].map((title) => (
                <section className={styles.panelSection} key={title}>
                  <div className={styles.panelHeader}>
                    <p className={styles.panelTitle}>{title}</p>
                  </div>
                </section>
              ))}
            </div>
            <p className={styles.persistenceStatus}>{t("playback.disabledHint")}</p>
          </aside>
        )}
      </section>
    </>
  );
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

function DrawerToggle({ open, onClick }: { open: boolean; onClick(): void }) {
  const { t } = useTranslation("viewer");
  return (
    <button
      className={styles.drawerToggle}
      type="button"
      aria-controls="practice-drawer"
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? t("playback.collapsePractice") : t("playback.practice")}
    </button>
  );
}

function loopSpeedCommand(loopId: string, value: string): PlaybackCommand {
  return value === ""
    ? { type: "set-loop-speed", loopId }
    : { type: "set-loop-speed", loopId, speed: Number(value) / 100 };
}

function loopValue(tick: number | undefined, durationTicks: number): number {
  if (tick === undefined || durationTicks <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, tick / durationTicks)) * 1000);
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
