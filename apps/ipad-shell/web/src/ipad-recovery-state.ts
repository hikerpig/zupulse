const routeStorageKey = "zupulse-ipad-route";
const libraryScoreIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PersistedRoute = { route: "library" } | { route: "viewer"; libraryScoreId: string };

export function restoreIpadRoute(target: Window): boolean {
  const route = readPersistedRoute(target);
  if (!route || route.route === "library") return false;
  target.location.hash = `#/viewer/${route.libraryScoreId}`;
  return true;
}

export function attachIpadRoutePersistence(target: Window): () => void {
  const persist = () => {
    const route = routeFromHash(target.location.hash);
    if (route) writePersistedRoute(target, route);
  };
  const originalPushState = target.history.pushState;
  const originalReplaceState = target.history.replaceState;
  target.history.pushState = (...arguments_) => {
    originalPushState.apply(target.history, arguments_);
    persist();
  };
  target.history.replaceState = (...arguments_) => {
    originalReplaceState.apply(target.history, arguments_);
    persist();
  };
  target.addEventListener("hashchange", persist);
  target.addEventListener("popstate", persist);
  persist();
  return () => {
    target.history.pushState = originalPushState;
    target.history.replaceState = originalReplaceState;
    target.removeEventListener("hashchange", persist);
    target.removeEventListener("popstate", persist);
  };
}

function routeFromHash(hash: string): PersistedRoute | undefined {
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/library") return { route: "library" };
  const match = hash.match(/^#\/viewer\/([^/?#]+)$/);
  if (!match || !libraryScoreIdPattern.test(match[1] ?? "")) return undefined;
  return { route: "viewer", libraryScoreId: match[1]! };
}

function readPersistedRoute(target: Window): PersistedRoute | undefined {
  try {
    const raw = target.localStorage.getItem(routeStorageKey);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) throw new Error("INVALID_ROUTE");
    const keys = Object.keys(value).sort().join(",");
    if (value.route === "library" && keys === "route") return { route: "library" };
    if (
      value.route === "viewer" &&
      keys === "libraryScoreId,route" &&
      typeof value.libraryScoreId === "string" &&
      libraryScoreIdPattern.test(value.libraryScoreId)
    ) {
      return { route: "viewer", libraryScoreId: value.libraryScoreId };
    }
    throw new Error("INVALID_ROUTE");
  } catch {
    try {
      target.localStorage.removeItem(routeStorageKey);
    } catch {
      // Storage is optional; the shell remains usable without restoration.
    }
    return undefined;
  }
}

function writePersistedRoute(target: Window, route: PersistedRoute): void {
  try {
    target.localStorage.setItem(routeStorageKey, JSON.stringify(route));
  } catch {
    // Storage is optional; the shell remains usable without restoration.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
