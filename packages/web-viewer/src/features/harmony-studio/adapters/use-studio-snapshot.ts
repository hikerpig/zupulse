import { useCallback, useRef, useSyncExternalStore } from "react";
import type { StudioApplication, StudioApplicationSnapshot } from "../StudioApplication";

export function useStudioSnapshot<TSelected>(
  application: StudioApplication,
  selector: (snapshot: StudioApplicationSnapshot | undefined) => TSelected,
  isEqual: (left: TSelected, right: TSelected) => boolean = Object.is,
): TSelected {
  const cache = useRef<{ value: TSelected } | null>(null);
  const getSnapshot = useCallback(() => {
    const selected = selector(application.getSnapshot());
    if (cache.current && isEqual(cache.current.value, selected)) return cache.current.value;
    cache.current = { value: selected };
    return selected;
  }, [application, isEqual, selector]);

  return useSyncExternalStore(application.subscribe, getSnapshot, getSnapshot);
}
