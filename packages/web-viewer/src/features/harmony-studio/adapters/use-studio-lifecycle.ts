import { useEffect } from "react";
import type { StudioApplication } from "../StudioApplication";
import { hasUnpersistedStudioDocument, type StudioSnapshot } from "../model/studio-page-model";

export function useStudioLifecycle({
  application,
  libraryScoreId,
  storageAvailable,
  active,
  previewEnabled,
  studio,
}: {
  application: StudioApplication;
  libraryScoreId: string | undefined;
  storageAvailable: boolean;
  active: boolean;
  previewEnabled: boolean;
  studio: StudioSnapshot | undefined;
}) {
  useEffect(() => {
    if (libraryScoreId && storageAvailable) void application.open(libraryScoreId);
  }, [application, libraryScoreId, storageAvailable]);

  useEffect(() => {
    if (libraryScoreId && active) application.setPreviewEnabled(libraryScoreId, previewEnabled);
  }, [active, application, libraryScoreId, previewEnabled]);

  useEffect(() => {
    if (!libraryScoreId || !storageAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void application.flush(libraryScoreId);
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
