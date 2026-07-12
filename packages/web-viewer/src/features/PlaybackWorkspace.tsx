import { musicalPositionFromTick, type PlaybackCommand } from '@tab-viewer/web-core';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ViewerSessionHandle } from '../host';
import { presentPlayback } from '../playbackPresenter';
import { Slider } from '../components/Slider';

export function PlaybackWorkspace({
  session,
  children,
}: {
  session: ViewerSessionHandle | undefined;
  children: ReactNode;
}) {
  return <PlaybackLayout playback={session?.playback}>{children}</PlaybackLayout>;
}

function PlaybackLayout({ playback, children }: { playback: ViewerSessionHandle['playback']; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const state = useSyncExternalStore(
    (listener) => playback?.subscribe(() => listener()) ?? (() => undefined),
    () => playback?.getState() ?? null,
  );
  if (!playback || !state) return disabledPlaybackWorkspace(children, drawerOpen, setDrawerOpen);
  const view = presentPlayback(state);
  const dispatch = (command: PlaybackCommand) => void playback.dispatch(command);
  const position = (ratio: number) =>
    musicalPositionFromTick(
      Math.round(playback.timeline.durationTicks * ratio),
      playback.timeline.durationMs * ratio,
      playback.timeline,
    );

  return (
    <>
      <section className="transport-bar" aria-label="播放控制">
        <div className="transport-actions">
          <button
            className="primary-button"
            type="button"
            disabled={view.playDisabled}
            onClick={() => dispatch({ type: 'toggle-playback' })}
          >
            {view.playLabel}
          </button>
          <button type="button" disabled={view.stopDisabled} onClick={() => dispatch({ type: 'stop' })}>
            停止
          </button>
        </div>
        <div className="transport-progress">
          <span className="time-readout">
            {view.currentTime} / {view.duration}
          </span>
          <Slider
            label="播放进度"
            max={1000}
            value={Math.round(view.progress * 1000)}
            onValueChange={(value) => dispatch({ type: 'seek', position: position(value / 1000) })}
          />
        </div>
        <div className="transport-tools">
          <label className="speed-control">
            <span>速度</span>
            <Slider
              label="速度"
              min={25}
              max={200}
              step={5}
              value={view.speedPercent}
              onValueChange={(value) => dispatch({ type: 'set-score-speed', speed: value / 100 })}
            />
            <output>{view.speedPercent}%</output>
          </label>
          <p className={`status-chip ${audioTone(state.soundFont)}`}>{audioText(state.soundFont)}</p>
          {view.soundFontRetryVisible && (
            <button type="button" onClick={() => dispatch({ type: 'retry-soundfont' })}>
              重试音频
            </button>
          )}
          <DrawerToggle open={drawerOpen} onClick={() => setDrawerOpen((open) => !open)} />
        </div>
      </section>
      <section className="workspace">
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className="practice-panel" aria-label="练习设置">
            <div className="drawer-header">
              <div>
                <p className="drawer-kicker">Practice</p>
                <h2 className="drawer-title">练习设置</h2>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="关闭练习设置"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <section className="panel-section">
              <div className="panel-header">
                <p className="panel-title">Loop</p>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={view.looping}
                    onChange={(event) => dispatch({ type: 'set-loop-enabled', enabled: event.currentTarget.checked })}
                  />
                  <span>启用循环</span>
                </label>
              </div>
              <div className="panel-content">
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'set-loop-boundary',
                        boundary: 'start',
                        position: state.position,
                      })
                    }
                  >
                    设为 A
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'set-loop-boundary',
                        boundary: 'end',
                        position: state.position,
                      })
                    }
                  >
                    设为 B
                  </button>
                  <button type="button" onClick={() => dispatch({ type: 'save-loop' })}>
                    保存区间
                  </button>
                </div>
                <label>
                  <span>边界吸附</span>
                  <select
                    value={view.loopSnapMode}
                    onChange={(event) =>
                      dispatch({
                        type: 'set-loop-snap',
                        mode: event.currentTarget.value as typeof view.loopSnapMode,
                      })
                    }
                  >
                    <option value="off">关闭</option>
                    <option value="beat">按拍</option>
                    <option value="measure">按小节</option>
                  </select>
                </label>
                <label>
                  <span>A 点</span>
                  <Slider
                    label="循环 A 点"
                    max={1000}
                    value={loopValue(state.loopDraft.start?.tick, playback.timeline.durationTicks)}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'set-loop-boundary',
                        boundary: 'start',
                        position: position(value / 1000),
                      })
                    }
                  />
                </label>
                <label>
                  <span>B 点</span>
                  <Slider
                    label="循环 B 点"
                    max={1000}
                    value={loopValue(state.loopDraft.end?.tick, playback.timeline.durationTicks)}
                    onValueChange={(value) =>
                      dispatch({
                        type: 'set-loop-boundary',
                        boundary: 'end',
                        position: position(value / 1000),
                      })
                    }
                  />
                </label>
                <div className="item-list">
                  {view.loops.map((loop) => (
                    <div className="loop-row" key={loop.id}>
                      <button type="button" onClick={() => dispatch({ type: 'select-loop', loopId: loop.id })}>
                        {loop.selected ? '当前' : '选择'}
                      </button>
                      <input
                        aria-label="循环名称"
                        value={loop.label}
                        onChange={(event) =>
                          dispatch({
                            type: 'rename-loop',
                            loopId: loop.id,
                            label: event.currentTarget.value,
                          })
                        }
                      />
                      <span>{loop.rangeLabel}</span>
                      <input
                        type="number"
                        min="25"
                        max="200"
                        step="5"
                        value={loop.speedPercent ?? ''}
                        placeholder="默认"
                        aria-label="循环速度百分比"
                        onChange={(event) => dispatch(loopSpeedCommand(loop.id, event.currentTarget.value))}
                      />
                      <button type="button" onClick={() => dispatch({ type: 'delete-loop', loopId: loop.id })}>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="panel-section">
              <div className="panel-header">
                <p className="panel-title">Tracks</p>
              </div>
              <div className="panel-content item-list">
                {view.tracks.map((track) => (
                  <div className="track-row" key={track.id}>
                    <strong>{track.name}</strong>
                    <Check
                      label="主"
                      type="radio"
                      name="primary-track"
                      checked={track.primary}
                      onChange={() => dispatch({ type: 'set-primary-track', trackId: track.id })}
                    />
                    <Check
                      label="显示"
                      checked={track.additional}
                      onChange={(checked) =>
                        dispatch({
                          type: 'set-additional-tracks',
                          trackIds: checked
                            ? [...new Set([...state.trackState.additionalVisibleTrackIds, track.id])]
                            : state.trackState.additionalVisibleTrackIds.filter((id) => id !== track.id),
                        })
                      }
                    />
                    <Check
                      label="静音"
                      checked={track.muted}
                      onChange={(muted) => dispatch({ type: 'set-track-mute', trackId: track.id, muted })}
                    />
                    <Check
                      label="独奏"
                      checked={track.solo}
                      onChange={(solo) => dispatch({ type: 'set-track-solo', trackId: track.id, solo })}
                    />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={track.volumePercent}
                      aria-label={`${track.name} 音量`}
                      onChange={(event) =>
                        dispatch({
                          type: 'set-track-volume',
                          trackId: track.id,
                          volume: Number(event.currentTarget.value) / 100,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
            <p className="persistence-status" aria-live="polite">
              {view.persistenceMessage}
            </p>
          </aside>
        )}
      </section>
    </>
  );
}

function Check({
  label,
  checked,
  onChange,
  type = 'checkbox',
  name,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  type?: 'checkbox' | 'radio';
  name?: string;
}) {
  return (
    <label>
      <input type={type} name={name} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

function disabledPlaybackWorkspace(children: ReactNode, drawerOpen: boolean, setDrawerOpen: (open: boolean) => void) {
  return (
    <>
      <section className="transport-bar" aria-label="播放控制">
        <div className="transport-actions">
          <button className="primary-button" type="button" disabled>
            播放
          </button>
          <button type="button" disabled>
            停止
          </button>
        </div>
        <div className="transport-progress">
          <span className="time-readout">0:00 / 0:00</span>
          <Slider label="播放进度" max={1000} value={0} disabled />
        </div>
        <div className="transport-tools">
          <label className="speed-control">
            <span>速度</span>
            <Slider label="速度" min={25} max={200} value={100} disabled />
            <output>100%</output>
          </label>
          <p className="status-chip subtle">音频准备中</p>
          <DrawerToggle open={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} />
        </div>
      </section>
      <section className="workspace">
        {children}
        {drawerOpen && (
          <aside id="practice-drawer" className="practice-panel" aria-label="练习设置">
            <div className="drawer-header">
              <div>
                <p className="drawer-kicker">Practice</p>
                <h2 className="drawer-title">练习设置</h2>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="关闭练习设置"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="persistence-status">打开乐谱后可调整循环和轨道</p>
          </aside>
        )}
      </section>
    </>
  );
}

function DrawerToggle({ open, onClick }: { open: boolean; onClick(): void }) {
  return (
    <button
      className="drawer-toggle"
      type="button"
      aria-controls="practice-drawer"
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? '收起设置' : '练习设置'}
    </button>
  );
}

function audioText(soundFont: 'idle' | 'loading' | 'ready' | 'error') {
  return soundFont === 'ready' ? '音频已就绪' : soundFont === 'error' ? '音频初始化失败' : '音频准备中';
}
function audioTone(soundFont: 'idle' | 'loading' | 'ready' | 'error') {
  return soundFont === 'ready' ? 'ready' : soundFont === 'error' ? 'error' : 'subtle';
}
function loopSpeedCommand(loopId: string, value: string): PlaybackCommand {
  return value === ''
    ? { type: 'set-loop-speed', loopId }
    : { type: 'set-loop-speed', loopId, speed: Number(value) / 100 };
}

function loopValue(tick: number | undefined, durationTicks: number): number {
  if (tick === undefined || durationTicks <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, tick / durationTicks)) * 1000);
}
