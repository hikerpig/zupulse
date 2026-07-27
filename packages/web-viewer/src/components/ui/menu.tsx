import { Menu as BaseMenu } from "@base-ui/react/menu";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuPortal = BaseMenu.Portal;

export const MenuPositioner = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BaseMenu.Positioner>>(
  function MenuPositioner({ className, ...props }, ref) {
    return (
      <BaseMenu.Positioner {...props} ref={ref} className={mergeClassName("tw:z-overlay tw:max-w-full", className)} />
    );
  },
);

export const MenuPopup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BaseMenu.Popup>>(function MenuPopup(
  { className, ...props },
  ref,
) {
  return (
    <BaseMenu.Popup
      {...props}
      ref={ref}
      className={mergeClassName(
        "tw:max-w-full tw:min-w-menu tw:rounded-panel tw:border tw:border-solid tw:border-border tw:bg-elevated tw:p-1 tw:text-foreground tw:shadow-workbench tw:transition-opacity tw:duration-fast tw:ease-ui tw:data-ending-style:opacity-0 tw:data-starting-style:opacity-0 tw:motion-reduce:transition-none",
        className,
      )}
    />
  );
});

export const MenuItem = forwardRef<HTMLElement, ComponentPropsWithoutRef<typeof BaseMenu.Item>>(function MenuItem(
  { className, ...props },
  ref,
) {
  return (
    <BaseMenu.Item
      {...props}
      ref={ref}
      className={mergeClassName(
        "tw:flex tw:min-h-control-sm tw:cursor-default tw:items-center tw:gap-2 tw:rounded-control tw:px-2 tw:text-caption tw:outline-none tw:select-none tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:data-highlighted:bg-accent-soft tw:data-highlighted:text-accent",
        className,
      )}
    />
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
