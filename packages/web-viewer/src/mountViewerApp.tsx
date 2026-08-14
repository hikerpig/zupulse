import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { LocaleHost, TelemetryControl, ViewerAppHandle, ViewerDomBindings, ViewerFile, ViewerHost } from "./host";
import type { ViewerSessionPort } from "./viewer-session/viewer-session-types";
import { App, type ViewerProductCapabilities } from "./app/App";
import { ViewerApplication } from "./app/ViewerApplication";
import { createStudioScoreRuntime, type StudioScoreRuntime } from "./studio-score-runtime";
import type {
  ScoreFileGateway,
  ScoreFormatAdapter,
  ScoreImportSource,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import { createAppI18n } from "@zupulse/app-i18n";
import type { BundledSampleSource } from "./sample-scores";

export type ViewerAppDependencies = {
  host: ViewerHost;
  telemetryControl?: TelemetryControl;
  initialSurface?: "library" | "viewer" | "studio" | "not-found";
  localeHost?: LocaleHost;
  openSession(file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings): Promise<ViewerSessionPort>;
  openStudioRuntime?(file: ViewerFile): Promise<StudioScoreRuntime>;
  capabilities?: ViewerProductCapabilities;
  library: {
    repository: SheetLibraryRepository;
    gateway: ScoreFileGateway;
    adapters: readonly ScoreFormatAdapter[];
    createDroppedImportSources?(
      files: readonly File[],
    ): readonly ScoreImportSource[] | Promise<readonly ScoreImportSource[]>;
    sampleSources?: readonly BundledSampleSource[];
  };
};

export function mountViewerApp(rootElement: HTMLElement, dependencies: ViewerAppDependencies): ViewerAppHandle {
  const root = createRoot(rootElement);
  const application = new ViewerApplication(
    dependencies.host,
    dependencies.openSession,
    dependencies.library,
    dependencies.openStudioRuntime ?? ((file) => createStudioScoreRuntime(rootElement.ownerDocument, file)),
    undefined,
    dependencies.telemetryControl,
    dependencies.initialSurface,
  );
  const localeHost: LocaleHost = dependencies.localeHost ?? {
    initialState: { preference: "zh-CN", effectiveLocale: "zh-CN" },
    async setPreference(preference) {
      return { preference, effectiveLocale: preference === "system" ? "zh-CN" : preference };
    },
  };
  const i18n = createAppI18n(localeHost.initialState.effectiveLocale);
  flushSync(() =>
    root.render(
      <StrictMode>
        <App
          application={application}
          localeHost={localeHost}
          i18n={i18n}
          {...(dependencies.host.externalNavigation === undefined
            ? {}
            : { externalNavigationHost: dependencies.host.externalNavigation })}
          {...(dependencies.capabilities === undefined ? {} : { capabilities: dependencies.capabilities })}
        />
      </StrictMode>,
    ),
  );
  let destroyPromise: Promise<void> | undefined;
  return {
    openScore: () => application.openScore(),
    importScoreSources: (sources) => application.importScoreSources(sources),
    togglePlayback: () => application.togglePlayback(),
    pauseAndFlush: () => application.pauseAndFlush(),
    destroy: () => (destroyPromise ??= application.destroy().finally(() => root.unmount())),
  };
}
