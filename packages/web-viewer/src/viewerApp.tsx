// Backward-compatible entry for the viewer session surface.
//
// B1 moved the open-session wiring into `viewer-session/viewer-session.ts`
// (`ViewerSession`); A4 moved the shared alphaTab settings/zoom helpers into
// `alpha-tab/alpha-tab-settings.ts`. This module re-exports the same names so
// existing consumers (shells via `@zupulse/web-viewer`, `viewerApp.test.ts`)
// keep working unchanged.
export {
  createDefaultOpenSession,
  renderViewerState,
  transportEnteredStopped,
  ViewerSession,
  type DefaultOpenSessionDependencies,
} from "./viewer-session/viewer-session";
export { attachScoreZoomCommit, createViewerAlphaTabSettings } from "./alpha-tab/alpha-tab-settings";
