import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import { SheetLibrary } from "../../features/SheetLibrary";
import { ViewerPage } from "./ViewerPage";

export function LibraryPage({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("library");
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const navigate = useNavigate();

  useEffect(() => {
    const refresh = () => void application.refreshLibrary();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [application]);

  if (!application.hasLibrary()) return <ViewerPage application={application} />;
  const library = snapshot.library ?? { scores: [], loading: true };
  const { error, ...libraryProps } = library;
  return (
    <SheetLibrary
      application={application}
      {...libraryProps}
      {...(error === undefined ? {} : { error: t("unavailableMessage") })}
      onSelectImportFiles={() => application.selectImportSources()}
      {...(application.supportsDroppedFileImport()
        ? { onDropImportFiles: (files: readonly File[]) => application.createDroppedImportSources(files) }
        : {})}
      onImportSources={(sources) => application.importScoreSources(sources)}
      onOpen={(id) => void navigate(`/viewer/${id}`)}
    />
  );
}
