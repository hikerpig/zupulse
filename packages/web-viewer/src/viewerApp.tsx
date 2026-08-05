// Backward-compatible entry for the viewer session surface.
//
// B1 moved the open-session wiring into `viewer-session/viewer-session.ts`
// (`ViewerSession`) and the alphaTab settings/zoom helpers into
// `viewer-session/alpha-tab-runtime.ts`. This module re-exports the same names
// so existing consumers (shells via `@zupulse/web-viewer`, `studio-score-runtime`,
// `viewerApp.test.ts`) keep working unchanged.
export {
  createDefaultOpenSession,
  renderViewerState,
  transportEnteredStopped,
  ViewerSession,
  type DefaultOpenSessionDependencies,
} from "./viewer-session/viewer-session";
export { attachScoreZoomCommit, createViewerAlphaTabSettings } from "./viewer-session/alpha-tab-runtime";
