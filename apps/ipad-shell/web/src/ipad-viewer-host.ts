import type { TelemetryEvent, TelemetryPort } from "@zupulse/web-core";
import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import { createDefaultOpenSession, mountViewerApp, type ViewerAppHandle, type ViewerHost } from "@zupulse/web-viewer";
import type { IpadBridgeTransport } from "./ipad-bridge-transport";
import { attachIpadLifecycle } from "./ipad-lifecycle";
import { attachIpadRoutePersistence, restoreIpadRoute } from "./ipad-recovery-state";
import { IpadScoreFileGateway, type IpadFileSelectionClient } from "./ipad-score-file-gateway";
import { IpadLibraryPlaybackPersistence } from "./ipad-library-playback-persistence";
import { attachExternalOpen } from "./external-open";

export type IpadStartupTiming = {
  startedAt: number;
  applicationReadyMs?: number;
  workspaceReadyMs?: number;
};

type CompositionDependencies = {
  createRepository(): IndexedDbSheetLibraryRepository;
  mount: typeof mountViewerApp;
  startupStartedAt?: number;
  startupTiming?: IpadStartupTiming;
};

const defaultDependencies: CompositionDependencies = {
  createRepository: () => new IndexedDbSheetLibraryRepository(),
  mount: mountViewerApp,
};

export async function mountIpadViewerApplication(
  root: HTMLElement,
  bridge: IpadBridgeTransport,
  dependencies: Partial<CompositionDependencies> = {},
): Promise<ViewerAppHandle> {
  const createRepository = dependencies.createRepository ?? defaultDependencies.createRepository;
  const mount = dependencies.mount ?? defaultDependencies.mount;
  const repository = createRepository();
  await repository.initialize();

  const persistence = new IpadLibraryPlaybackPersistence(repository);
  const lifecycleTarget = root.ownerDocument.defaultView;
  if (lifecycleTarget) restoreIpadRoute(lifecycleTarget);
  const application = mount(root, {
    capabilities: { harmonyAnalysis: false },
    host: createIpadViewerHost(
      dependencies.startupTiming === undefined ? undefined : recordStartupTiming(dependencies.startupTiming),
    ),
    ...(dependencies.startupStartedAt === undefined ? {} : { startupStartedAt: dependencies.startupStartedAt }),
    openSession: createDefaultOpenSession(root.ownerDocument, persistence),
    library: {
      repository,
      gateway: new IpadScoreFileGateway(bridge as IpadFileSelectionClient),
      adapters: [
        {
          format: "gp",
          parse: async (input) => (await import("@zupulse/web-core")).createGpFormatAdapter().parse(input),
        },
        {
          format: "musicxml",
          parse: async (input) => (await import("@zupulse/web-core")).createMusicXmlAdapter().parse(input),
        },
      ],
    },
  });
  if (!lifecycleTarget) return application;
  const detachLifecycle = attachIpadLifecycle(lifecycleTarget, application, bridge);
  const detachRoutePersistence = attachIpadRoutePersistence(lifecycleTarget);
  const readyHandler = (
    lifecycleTarget as typeof lifecycleTarget & {
      webkit?: {
        messageHandlers?: { zupulseExternalOpenReady?: { postMessage(value: Record<string, never>): unknown } };
      };
    }
  ).webkit?.messageHandlers?.zupulseExternalOpenReady;
  const detachExternalOpen = attachExternalOpen({
    target: lifecycleTarget,
    application,
    ...(readyHandler === undefined ? {} : { readyHandler }),
  });
  const destroy = application.destroy.bind(application);
  application.destroy = async () => {
    detachLifecycle();
    detachRoutePersistence();
    detachExternalOpen();
    await destroy();
  };
  return application;
}

function createIpadViewerHost(telemetry?: TelemetryPort): ViewerHost {
  return {
    subscribe() {
      return () => undefined;
    },
    ...(telemetry === undefined ? {} : { telemetry }),
  };
}

function recordStartupTiming(timing: IpadStartupTiming): TelemetryPort {
  return {
    capture(event: TelemetryEvent) {
      if (event.name === "application_ready" && event.durationMs !== undefined) {
        timing.applicationReadyMs = event.durationMs;
      }
      if (event.name === "workspace_session_started" && event.durationMs !== undefined) {
        timing.workspaceReadyMs = event.durationMs;
      }
    },
    captureException() {},
    flush: async () => undefined,
  };
}
