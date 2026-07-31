import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import styles from "../../PlaybackWorkspace.module.css";

export function BpmControl({
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
