import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import { SheetLibrary } from "../../features/SheetLibrary";

export function LibraryPage({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("library");
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const navigate = useNavigate();
  useEffect(() => {
    const refresh = () => void application.refreshLibrary();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [application]);

  const library = snapshot.library ?? { scores: [], loading: true };
  const { error, ...libraryProps } = library;
  useEffect(() => {
    if (error) application.capturePresentedIssue("library", error);
  }, [application, error]);
  return (
    <SheetLibrary
      application={application}
      {...libraryProps}
      {...(error === undefined ? {} : { error: t("unavailableMessage") })}
      onSelectImportFiles={() => application.selectImportSources()}
      {...(application.supportsDroppedFileImport()
        ? { onDropImportFiles: (files: readonly File[]) => application.createDroppedImportSources(files) }
        : {})}
      sampleScores={application.getBundledSampleScores()}
      onSelectSample={(id) => application.createBundledSampleSource(id)}
      onImportSources={(sources) => application.importScoreSources(sources)}
      onOpen={(id) => void navigate(`/viewer/${id}`)}
    />
  );
}
