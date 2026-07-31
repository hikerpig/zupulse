import { useEffect } from "react";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import { hasUnpersistedStudioDocument, type StudioSnapshot } from "../model/studio-page-model";

export function useStudioLifecycle({
  application,
  libraryScoreId,
  storageAvailable,
  active,
  previewEnabled,
  studio,
}: {
  application: ViewerApplication;
  libraryScoreId: string | undefined;
  storageAvailable: boolean;
  active: boolean;
  previewEnabled: boolean;
  studio: StudioSnapshot | undefined;
}) {
  useEffect(() => {
    if (libraryScoreId && storageAvailable) void application.openStudio(libraryScoreId);
  }, [application, libraryScoreId, storageAvailable]);

  useEffect(() => {
    if (libraryScoreId && active) application.setStudioPreviewEnabled(libraryScoreId, previewEnabled);
  }, [active, application, libraryScoreId, previewEnabled]);

  useEffect(() => {
    if (!libraryScoreId || !storageAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void application.flushStudio(libraryScoreId);
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnpersistedStudioDocument(studio)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [application, libraryScoreId, storageAvailable, studio]);
}
