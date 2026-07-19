import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ViewerAppHandle, ViewerFile, ViewerHost, ViewerSessionHandle } from "./host";
import { App } from "./app/App";
import { ViewerApplication } from "./app/ViewerApplication";
import { createStudioScoreRuntime, type StudioScoreRuntime } from "./studio-score-runtime";
import type { ScoreFileGateway, ScoreFormatAdapter, SheetLibraryRepository } from "@zupulse/web-core";

export type ViewerAppDependencies = {
  host: ViewerHost;
  openSession(file: ViewerFile, libraryScoreId?: string): Promise<ViewerSessionHandle>;
  openStudioRuntime?(file: ViewerFile): Promise<StudioScoreRuntime>;
  library?: { repository: SheetLibraryRepository; gateway: ScoreFileGateway; adapters: readonly ScoreFormatAdapter[] };
};

export function mountViewerApp(rootElement: HTMLElement, dependencies: ViewerAppDependencies): ViewerAppHandle {
  const root = createRoot(rootElement);
  const application = new ViewerApplication(
    dependencies.host,
    dependencies.openSession,
    dependencies.library,
    dependencies.openStudioRuntime ?? ((file) => createStudioScoreRuntime(rootElement.ownerDocument, file)),
  );
  flushSync(() =>
    root.render(
      <StrictMode>
        <App application={application} />
      </StrictMode>,
    ),
  );
  let destroyPromise: Promise<void> | undefined;
  return {
    openScore: () => application.openScore(),
    togglePlayback: () => application.togglePlayback(),
    pauseAndFlush: () => application.pauseAndFlush(),
    destroy: () => (destroyPromise ??= application.destroy().finally(() => root.unmount())),
  };
}
