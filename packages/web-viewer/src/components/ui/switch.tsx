import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const Switch = forwardRef<HTMLElement, ComponentPropsWithoutRef<typeof BaseSwitch.Root>>(function Switch(
  { className, ...props },
  ref,
) {
  return (
    <BaseSwitch.Root
      {...props}
      ref={ref}
      className={mergeClassName(
        "tw:box-border tw:inline-flex tw:h-switch-track-height tw:w-switch-track-width tw:shrink-0 tw:cursor-pointer tw:items-center tw:rounded-icon tw:border tw:border-solid tw:border-border tw:bg-control tw:p-switch-inset tw:transition-colors tw:duration-fast tw:ease-ui tw:focus-visible:shadow-focus tw:focus-visible:outline-none tw:data-checked:border-accent tw:data-checked:bg-accent-soft tw:data-disabled:cursor-not-allowed tw:data-disabled:opacity-50 tw:motion-reduce:transition-none",
        className,
      )}
    >
      <BaseSwitch.Thumb className="tw:size-switch-thumb tw:rounded-icon tw:bg-switch-thumb tw:transition-transform tw:duration-fast tw:ease-ui tw:data-checked:translate-x-4 tw:data-checked:bg-accent tw:motion-reduce:transition-none" />
    </BaseSwitch.Root>
  );
});

function mergeClassName<State>(
  base: string,
  custom: string | ((state: State) => string | undefined) | undefined,
): string | ((state: State) => string) {
  if (typeof custom === "function") return (state) => classes(base, custom(state));
  return classes(base, custom);
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
