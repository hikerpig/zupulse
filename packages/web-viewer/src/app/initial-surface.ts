export type ViewerInitialSurface = "library" | "viewer" | "studio" | "not-found";

/**
 * Maps a hash-router location to the telemetry initial surface. The router in
 * `app/router.tsx` owns the route table; this projection must stay aligned with it.
 * Non-score routes such as `/settings` and `/pdf-omr` currently report `not-found`.
 */
export function initialSurfaceForHash(hash: string): ViewerInitialSurface {
  const route = hash.replace(/^#/, "").split("?")[0] || "/";
  if (route === "/" || route === "/library") return "library";
  if (route.startsWith("/viewer/")) return "viewer";
  if (route.startsWith("/studio/")) return "studio";
  return "not-found";
}
