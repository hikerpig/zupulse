import { PopoverPopup, PopoverPortal, PopoverPositioner, PopoverRoot } from "./ui";

export function ContextPopup({
  anchor,
  open,
  onOpenChange,
  children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: React.ReactNode;
}) {
  return (
    <PopoverRoot open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <PopoverPortal container={anchor?.ownerDocument.body}>
        <PopoverPositioner anchor={anchor} positionMethod="fixed" sideOffset={8} align="start" collisionPadding={16}>
          <PopoverPopup className="tw:max-h-context-max tw:max-w-context-max tw:min-w-context-min">
            {children}
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}
