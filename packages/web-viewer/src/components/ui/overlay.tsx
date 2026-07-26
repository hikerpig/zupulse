import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const PopoverRoot = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverPortal = BasePopover.Portal;
export const PopoverClose = BasePopover.Close;

export const PopoverPositioner = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BasePopover.Positioner>>(
  function PopoverPositioner({ className, ...props }, ref) {
    return (
      <BasePopover.Positioner
        {...props}
        ref={ref}
        className={mergeClassName("tw:z-overlay tw:max-w-full", className)}
      />
    );
  },
);

export const PopoverPopup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BasePopover.Popup>>(
  function PopoverPopup({ className, ...props }, ref) {
    return (
      <BasePopover.Popup
        {...props}
        ref={ref}
        className={mergeClassName(
          "tw:max-h-full tw:max-w-full tw:overflow-y-auto tw:rounded-overlay tw:border tw:border-solid tw:border-border tw:bg-surface tw:p-4 tw:text-foreground tw:shadow-overlay tw:transition-opacity tw:duration-fast tw:ease-ui tw:data-ending-style:opacity-0 tw:data-starting-style:opacity-0 tw:motion-reduce:transition-none",
          className,
        )}
      />
    );
  },
);

export const PopoverTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithoutRef<typeof BasePopover.Title>>(
  function PopoverTitle({ className, ...props }, ref) {
    return (
      <BasePopover.Title
        {...props}
        ref={ref}
        className={mergeClassName("tw:m-0 tw:font-semibold tw:text-title-sm tw:text-foreground", className)}
      />
    );
  },
);

export const PopoverDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof BasePopover.Description>
>(function PopoverDescription({ className, ...props }, ref) {
  return (
    <BasePopover.Description
      {...props}
      ref={ref}
      className={mergeClassName("tw:m-0 tw:text-body tw:text-muted", className)}
    />
  );
});

export const DialogRoot = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogPortal = BaseDialog.Portal;
export const DialogClose = BaseDialog.Close;

export const DialogBackdrop = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>>(
  function DialogBackdrop({ className, ...props }, ref) {
    return (
      <BaseDialog.Backdrop
        {...props}
        ref={ref}
        className={mergeClassName(
          "tw:inset-0 tw:fixed tw:z-overlay tw:bg-scrim tw:transition-opacity tw:duration-fast tw:ease-ui tw:data-ending-style:opacity-0 tw:data-starting-style:opacity-0 tw:motion-reduce:transition-none",
          className,
        )}
      />
    );
  },
);

export const DialogViewport = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BaseDialog.Viewport>>(
  function DialogViewport({ className, ...props }, ref) {
    return (
      <BaseDialog.Viewport
        {...props}
        ref={ref}
        className={mergeClassName(
          "tw:inset-0 tw:fixed tw:z-overlay tw:flex tw:items-start tw:justify-center tw:overflow-y-auto tw:p-4",
          className,
        )}
      />
    );
  },
);

export const DialogPopup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof BaseDialog.Popup>>(
  function DialogPopup({ className, ...props }, ref) {
    return (
      <BaseDialog.Popup
        {...props}
        ref={ref}
        className={mergeClassName(
          "tw:m-auto tw:w-full tw:max-w-dialog tw:rounded-overlay tw:border tw:border-solid tw:border-border tw:bg-surface tw:p-6 tw:text-foreground tw:shadow-overlay tw:transition-opacity tw:duration-fast tw:ease-ui tw:data-ending-style:opacity-0 tw:data-starting-style:opacity-0 tw:motion-reduce:transition-none",
          className,
        )}
      />
    );
  },
);

export const DialogTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithoutRef<typeof BaseDialog.Title>>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <BaseDialog.Title
        {...props}
        ref={ref}
        className={mergeClassName("tw:m-0 tw:font-semibold tw:text-title-sm tw:text-foreground", className)}
      />
    );
  },
);

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <BaseDialog.Description
      {...props}
      ref={ref}
      className={mergeClassName("tw:m-0 tw:text-body tw:text-muted", className)}
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
