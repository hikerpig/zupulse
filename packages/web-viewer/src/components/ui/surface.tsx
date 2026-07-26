import type { ComponentPropsWithoutRef } from "react";

export type PanelVariant = "structural" | "utility";

export interface PanelProps extends ComponentPropsWithoutRef<"section"> {
  variant?: PanelVariant;
}

const panelVariants: Record<PanelVariant, string> = {
  structural: "tw:rounded-panel tw:border-border tw:bg-surface tw:shadow-workbench",
  utility: "tw:rounded-control tw:border-border tw:bg-surface-muted",
};

export function Panel({ className, variant = "structural", ...props }: PanelProps) {
  return (
    <section
      {...props}
      className={classes("tw:border tw:border-solid", panelVariants[variant], className)}
      data-variant={variant}
    />
  );
}

export type StatusTone = "neutral" | "ready" | "warning" | "danger";

export interface StatusProps extends ComponentPropsWithoutRef<"span"> {
  tone?: StatusTone;
}

const statusTones: Record<StatusTone, string> = {
  neutral: "tw:border-border tw:bg-control tw:text-muted",
  ready: "tw:border-ready tw:bg-ready-surface tw:text-ready",
  warning: "tw:border-warning tw:bg-warning-surface tw:text-warning",
  danger: "tw:border-danger tw:bg-danger-surface tw:text-danger",
};

export function Status({ children, className, tone = "neutral", ...props }: StatusProps) {
  return (
    <span
      {...props}
      className={classes(
        "tw:font-semibold tw:inline-flex tw:items-center tw:gap-2 tw:rounded-icon tw:border tw:border-solid tw:px-2 tw:py-1 tw:text-caption",
        statusTones[tone],
        className,
      )}
      data-tone={tone}
    >
      <span aria-hidden="true" className="tw:size-2 tw:rounded-icon tw:bg-current" />
      {children}
    </span>
  );
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
