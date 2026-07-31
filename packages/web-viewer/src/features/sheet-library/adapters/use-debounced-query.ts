import { useEffect, useState } from "react";

export function useDebouncedQuery(query: string, delay = 200): string {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), delay);
    return () => window.clearTimeout(timer);
  }, [delay, query]);

  return debounced;
}
