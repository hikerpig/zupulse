import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import {
  Button,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
  TextField,
} from "../../../components/ui";

export function LibraryDialogs({
  application,
  editing,
  deleting,
  actionsReturnFocusRef,
  onEditingChange,
  onDeletingChange,
}: {
  application: ViewerApplication;
  editing: LibraryScoreSummary | undefined;
  deleting: LibraryScoreSummary | undefined;
  actionsReturnFocusRef: RefObject<HTMLButtonElement | null>;
  onEditingChange(score: LibraryScoreSummary | undefined): void;
  onDeletingChange(score: LibraryScoreSummary | undefined): void;
}) {
  const { t } = useTranslation("library");

  return (
    <>
      <DialogRoot
        open={Boolean(editing)}
        disablePointerDismissal
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onEditingChange(undefined);
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport>
            <DialogPopup finalFocus={actionsReturnFocusRef} className="tw:grid tw:gap-3">
              <DialogTitle>{t("editDialogLabel")}</DialogTitle>
              <form
                aria-label={t("editDialogLabel")}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editing) return;
                  const form = new FormData(event.currentTarget);
                  void application
                    .updateLibraryMetadata(editing.id, {
                      titleOverride: String(form.get("title") ?? "").trim() || undefined,
                      artistOverride: String(form.get("artist") ?? "").trim() || undefined,
                    })
                    .then(() => application.refreshLibrary())
                    .then(() => onEditingChange(undefined));
                }}
              >
                <label className="tw:block">
                  {t("fieldTitle")} <TextField name="title" defaultValue={editing?.title ?? ""} autoFocus />
                </label>
                <label className="tw:block">
                  {t("fieldArtist")} <TextField name="artist" defaultValue={editing?.artist ?? ""} />
                </label>
                <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
                  <DialogClose render={<Button tone="ghost" />}>{t("cancel")}</DialogClose>
                  <Button type="submit" tone="primary">
                    {t("save")}
                  </Button>
                </div>
              </form>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>

      <DialogRoot
        open={Boolean(deleting)}
        disablePointerDismissal
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onDeletingChange(undefined);
        }}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogViewport>
            <DialogPopup role="alertdialog" finalFocus={actionsReturnFocusRef} className="tw:grid tw:gap-3">
              <DialogTitle>{deleting ? t("deleteTitle", { title: deleting.title }) : ""}</DialogTitle>
              <DialogDescription>{t("deleteWarning")}</DialogDescription>
              <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
                <DialogClose render={<Button tone="ghost" />}>{t("cancel")}</DialogClose>
                <Button
                  tone="danger"
                  onClick={() => {
                    if (!deleting) return;
                    void application.deleteLibraryScore(deleting.id).then(() => onDeletingChange(undefined));
                  }}
                >
                  {t("deleteForever")}
                </Button>
              </div>
            </DialogPopup>
          </DialogViewport>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
