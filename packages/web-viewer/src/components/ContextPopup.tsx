import { useEffect, useRef, useState } from "react";
import styles from "./ContextPopup.module.css";

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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchor) return;
    const popupRect = popupRef.current?.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    if (!popupRect) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = anchorRect.bottom + 8;
    let left = anchorRect.left;

    if (left + popupRect.width > viewportWidth) {
      left = viewportWidth - popupRect.width - 16;
    }

    if (top + popupRect.height > viewportHeight) {
      top = anchorRect.top - popupRect.height - 8;
    }

    if (top < 16) top = 16;
    if (left < 16) left = 16;

    setPosition({ top, left });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    const onOutsideClick = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        anchor &&
        !anchor.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onOutsideClick);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onOutsideClick);
    };
  }, [open, onOpenChange, anchor]);

  if (!open) return null;

  return (
    <div className={styles.backdrop}>
      <div
        ref={popupRef}
        className={styles.popup}
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
