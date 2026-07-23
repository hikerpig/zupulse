import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import { createDefaultOpenSession, mountViewerApp, type ViewerAppHandle, type ViewerHost } from "@zupulse/web-viewer";
import type { IpadBridgeTransport } from "./ipad-bridge-transport";
import { attachIpadLifecycle } from "./ipad-lifecycle";
import { attachIpadRoutePersistence, restoreIpadRoute } from "./ipad-recovery-state";
import { IpadScoreFileGateway, type IpadFileSelectionClient } from "./ipad-score-file-gateway";
import { IpadLibraryPlaybackPersistence } from "./ipad-library-playback-persistence";

type CompositionDependencies = {
  createRepository(): IndexedDbSheetLibraryRepository;
  mount: typeof mountViewerApp;
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
    host: createIpadViewerHost(),
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
  const destroy = application.destroy.bind(application);
  application.destroy = async () => {
    detachLifecycle();
    detachRoutePersistence();
    await destroy();
  };
  return application;
}

function createIpadViewerHost(): ViewerHost {
  return {
    async openScore() {
      return undefined;
    },
    subscribe() {
      return () => undefined;
    },
  };
}
