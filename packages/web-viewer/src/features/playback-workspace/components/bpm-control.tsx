import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PopoverArrow,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ownerWindow = triggerRef.current?.ownerDocument.defaultView;
    if (!open || !ownerWindow) return undefined;
    const closeIfTriggerHidden = () => {
      if (triggerRef.current?.getClientRects().length === 0) setOpen(false);
    };
    ownerWindow.addEventListener("resize", closeIfTriggerHidden);
    return () => ownerWindow.removeEventListener("resize", closeIfTriggerHidden);
  }, [open]);

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        className={styles.speedTrigger}
        aria-label={t("playback.speedLabel", { tempo: currentTempo, percent: speedPercent })}
        disabled={disabled}
      >
        <strong>{currentTempo}</strong>
        <span>BPM · {speedPercent}%</span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverPositioner side="top" align="center" sideOffset={10}>
          <PopoverPopup className={styles.speedPopover} data-shortcuts-disabled>
            <PopoverTitle className="sr-only">{t("playback.speedTitle")}</PopoverTitle>
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
            <PopoverArrow className={styles.speedPopoverArrow} />
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}
