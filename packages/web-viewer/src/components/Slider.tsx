import { Slider as BaseSlider } from "@base-ui/react/slider";
import "./Slider.css";

export type SliderProps = {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  disabled?: boolean;
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
  onValueChange,
  onValueCommitted,
}: SliderProps) {
  return (
    <BaseSlider.Root
      className="base-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange?.(next)}
      onValueCommitted={(next) => onValueCommitted?.(next)}
    >
      <BaseSlider.Control className="base-slider-control">
        <BaseSlider.Track className="base-slider-track">
          <BaseSlider.Indicator className="base-slider-indicator" />
          <BaseSlider.Thumb className="base-slider-thumb" getAriaLabel={() => label} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
