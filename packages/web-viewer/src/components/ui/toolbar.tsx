import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";

export type ToolbarOrientation = "horizontal" | "vertical";

export interface ToolbarProps extends ComponentPropsWithoutRef<"div"> {
  orientation?: ToolbarOrientation;
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(",");

export function Toolbar({
  children,
  className,
  onFocusCapture,
  onKeyDown,
  orientation = "horizontal",
  ...props
}: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const items = toolbarItems(toolbarRef.current);
    if (items.length === 0) return;
    const activeItem = items.find((item) => item === document.activeElement);
    const currentItem = activeItem ?? items.find((item) => item.dataset.toolbarCurrent === "true") ?? items[0];
    setCurrentItem(items, currentItem);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || isTextControl(event.target)) return;
    const items = toolbarItems(toolbarRef.current);
    const currentIndex = items.indexOf(event.target as HTMLElement);
    if (currentIndex < 0) return;

    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (orientation === "horizontal" && event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
    if (orientation === "horizontal" && event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (orientation === "vertical" && event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (orientation === "vertical" && event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextItem = items[nextIndex];
    setCurrentItem(items, nextItem);
    nextItem?.focus();
  };

  return (
    <div
      {...props}
      ref={toolbarRef}
      role="toolbar"
      aria-orientation={orientation}
      className={classes(
        "tw:flex tw:gap-2",
        orientation === "vertical" ? "tw:flex-col tw:items-stretch" : "tw:flex-row tw:items-center",
        className,
      )}
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        const items = toolbarItems(toolbarRef.current);
        const target = event.target as HTMLElement;
        if (items.includes(target)) setCurrentItem(items, target);
      }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

function toolbarItems(toolbar: HTMLElement | null): HTMLElement[] {
  if (toolbar === null) return [];
  return Array.from(toolbar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true",
  );
}

function setCurrentItem(items: HTMLElement[], current: HTMLElement | undefined) {
  for (const item of items) {
    const isCurrent = item === current;
    item.tabIndex = isCurrent ? 0 : -1;
    if (isCurrent) item.dataset.toolbarCurrent = "true";
    else delete item.dataset.toolbarCurrent;
  }
}

function isTextControl(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
  );
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
