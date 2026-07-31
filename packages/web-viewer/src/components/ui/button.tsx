import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "aria-busy" | "aria-pressed"> {
  iconOnly?: boolean;
  loading?: boolean;
  pressed?: boolean;
  size?: ButtonSize;
  tone?: ButtonTone;
}

const baseClasses =
  "tw:inline-flex tw:shrink-0 tw:cursor-pointer tw:select-none tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-solid tw:font-ui tw:text-body tw:font-semibold tw:transition-colors tw:duration-fast tw:ease-ui tw:focus-visible:outline-none tw:focus-visible:shadow-focus tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50";

const toneClasses: Record<ButtonTone, string> = {
  primary:
    "tw:border-accent tw:bg-accent tw:text-on-accent tw:hover:border-accent-hover tw:hover:bg-accent-hover tw:active:border-accent-hover tw:active:bg-accent-hover",
  secondary:
    "tw:border-border tw:bg-control tw:text-foreground tw:hover:border-border-strong tw:hover:bg-elevated tw:active:bg-control-active",
  ghost: "tw:border-transparent tw:bg-transparent tw:text-foreground tw:hover:bg-control tw:active:bg-control-active",
  danger: "tw:border-danger tw:bg-danger-surface tw:text-danger tw:hover:bg-control-active tw:active:bg-control",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "tw:h-control-sm tw:px-3 tw:text-caption",
  md: "tw:h-control tw:px-4",
  lg: "tw:h-control-lg tw:px-6 tw:text-lead",
};

const iconSizeClasses: Record<"sm" | "md", string> = {
  sm: "tw:h-control-sm tw:text-caption",
  md: "tw:h-control",
};

const pressedClasses: Record<ButtonTone, string> = {
  primary: "tw:border-accent-hover tw:bg-accent-hover",
  secondary: "tw:border-accent tw:bg-accent-soft",
  ghost: "tw:border-transparent tw:bg-accent-soft",
  danger: "tw:border-danger tw:bg-danger-surface",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled = false,
    iconOnly = false,
    loading = false,
    pressed,
    size = "md",
    tone = "secondary",
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes(
        baseClasses,
        toneClasses[tone],
        iconOnly && size !== "lg" ? iconSizeClasses[size] : sizeClasses[size],
        pressed ? pressedClasses[tone] : undefined,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-loading={loading || undefined}
      data-icon-button={iconOnly || undefined}
    >
      {loading ? <LoadingIndicator /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children" | "iconOnly" | "size"> {
  "aria-label": string;
  children?: ReactNode;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, size = "md", ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      iconOnly
      size={size}
      className={classes("tw:rounded-icon", size === "sm" ? "tw:w-control-sm" : "tw:w-control", className)}
    >
      {children}
    </Button>
  );
});

function LoadingIndicator() {
  return (
    <span
      aria-hidden="true"
      className="tw:animate-spin tw:size-4 tw:rounded-icon tw:border-2 tw:border-current tw:border-r-transparent tw:motion-reduce:animate-none"
    />
  );
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
