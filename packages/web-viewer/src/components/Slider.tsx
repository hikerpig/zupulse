import { Slider as BaseSlider } from "@base-ui/react/slider";
import { useEffect, useRef, useState } from "react";
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
  const [displayValue, setDisplayValue] = useState(value);
  const pendingValueRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const pendingValue = pendingValueRef.current;
    if (pendingValue !== undefined && pendingValue !== value) return;
    pendingValueRef.current = undefined;
    setDisplayValue(value);
  }, [value]);

  const previewValue = (next: number) => {
    pendingValueRef.current = next;
    setDisplayValue(next);
    onValueChange?.(next);
  };
  const commitValue = (next: number) => {
    pendingValueRef.current = next;
    setDisplayValue(next);
    onValueCommitted?.(next);
  };

  return (
    <BaseSlider.Root
      className={`${styles.root} ${variant === "progress" ? styles.progress : ""}`}
      min={min}
      max={max}
      step={step}
      value={displayValue}
      disabled={disabled}
      onValueChange={previewValue}
      onValueCommitted={commitValue}
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
