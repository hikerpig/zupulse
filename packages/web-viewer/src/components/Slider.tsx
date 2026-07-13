import { Slider as BaseSlider } from "@base-ui/react/slider";
import styles from "./Slider.module.css";

export type SliderProps = {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  disabled?: boolean;
  variant?: "default" | "progress";
  onValueChange?(value: number): void;
  onValueCommitted?(value: number): void;
};

export function Slider({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  disabled,
  variant = "default",
  onValueChange,
  onValueCommitted,
}: SliderProps) {
  return (
    <BaseSlider.Root
      className={`${styles.root} ${variant === "progress" ? styles.progress : ""}`}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange?.(next)}
      onValueCommitted={(next) => onValueCommitted?.(next)}
    >
      <BaseSlider.Control className={styles.control}>
        <BaseSlider.Track className={styles.track}>
          <BaseSlider.Indicator className={styles.indicator} />
          <BaseSlider.Thumb className={styles.thumb} getAriaLabel={() => label} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
