import { useTranslation } from "react-i18next";
import type { ViewerPlaybackSlice } from "../../../viewer-session/viewer-session-types";
import { usePlaybackSelector } from "../adapters/use-playback-selector";
import { presentPlayback, trackDisplayName } from "../model/playback-presenter";
import styles from "../../PlaybackWorkspace.module.css";

type Playback = ViewerPlaybackSlice;

export function TracksPracticePanel({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  usePlaybackSelector(playback, (state) => state.tracks);
  const trackState = usePlaybackSelector(playback, (state) => state.trackState);
  const view = presentPlayback(playback.getState());
  const dispatch = playback.dispatch;
  return (
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
              onChange={() => void dispatch({ type: "set-primary-track", trackId: track.id })}
            />
            <Check
              label={t("playback.visible")}
              checked={track.additional}
              onChange={(checked) =>
                void dispatch({
                  type: "set-additional-tracks",
                  trackIds: checked
                    ? [...new Set([...trackState.additionalVisibleTrackIds, track.id])]
                    : trackState.additionalVisibleTrackIds.filter((id) => id !== track.id),
                })
              }
            />
            <Check
              label={t("playback.mute")}
              checked={track.muted}
              onChange={(muted) => void dispatch({ type: "set-track-mute", trackId: track.id, muted })}
            />
            <Check
              label={t("playback.solo")}
              checked={track.solo}
              onChange={(solo) => void dispatch({ type: "set-track-solo", trackId: track.id, solo })}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={track.volumePercent}
              aria-label={t("playback.volume", { track: trackDisplayName(track, t) })}
              onChange={(event) =>
                void dispatch({
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
