import type { ScoreNavigationMode } from "./score-navigation-coordinator";

type NavigationInputTarget = {
  mode(): ScoreNavigationMode;
  manualNavigation(): void;
  movePage(delta: -1 | 1): void;
};

export function attachScoreNavigationInputs(
  element: HTMLElement,
  navigation: NavigationInputTarget,
  now: () => number = Date.now,
): () => void {
  let wheelLockedUntil = 0;
  let touchStart: { x: number; y: number } | undefined;

  const onWheel = (event: WheelEvent) => {
    if (navigation.mode() !== "page-turn") {
      navigation.manualNavigation();
      return;
    }
    event.preventDefault();
    if (Math.abs(event.deltaY) < 1 || now() < wheelLockedUntil) return;
    wheelLockedUntil = now() + 300;
    navigation.movePage(event.deltaY > 0 ? 1 : -1);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      navigation.mode() !== "page-turn" ||
      (event.key !== "PageUp" && event.key !== "PageDown") ||
      isInteractive(event.target)
    )
      return;
    event.preventDefault();
    navigation.movePage(event.key === "PageDown" ? 1 : -1);
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      touchStart = undefined;
      return;
    }
    const touch = event.touches[0]!;
    touchStart = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchMove = () => {
    if (navigation.mode() !== "page-turn") navigation.manualNavigation();
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart;
    touchStart = undefined;
    const end = event.changedTouches[0];
    if (!start || !end || navigation.mode() !== "page-turn") return;
    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    navigation.movePage(deltaX < 0 ? 1 : -1);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.target === element) navigation.manualNavigation();
  };

  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("touchstart", onTouchStart, { passive: true });
  element.addEventListener("touchmove", onTouchMove, { passive: true });
  element.addEventListener("touchend", onTouchEnd, { passive: true });
  element.addEventListener("pointerdown", onPointerDown, { passive: true });
  element.ownerDocument.addEventListener("keydown", onKeyDown);
  return () => {
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchmove", onTouchMove);
    element.removeEventListener("touchend", onTouchEnd);
    element.removeEventListener("pointerdown", onPointerDown);
    element.ownerDocument.removeEventListener("keydown", onKeyDown);
  };
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("a, button, input, select, textarea, [contenteditable], [role='slider']"))
  );
}
