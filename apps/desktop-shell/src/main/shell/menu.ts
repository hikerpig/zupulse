import { randomUUID } from "node:crypto";
import { createBridgeEvent, type BridgeEvent } from "@zupulse/web-core";
import { createAppI18n, type SupportedLocale } from "@zupulse/app-i18n";
import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import type { DesktopDiagnostics } from "../diagnostics/desktop-diagnostics";

export function installDesktopMenu(options: {
  sendEvent(event: BridgeEvent): void;
  diagnostics: DesktopDiagnostics;
  openDiagnosticsDirectory(): Promise<void>;
  getWindow(): BrowserWindow | undefined;
  locale: SupportedLocale;
}): void {
  const t = createAppI18n(options.locale).getFixedT(options.locale, "desktop");
  const command = (value: "open-score" | "toggle-playback") => () => {
    options.sendEvent(createBridgeEvent("app.command", randomUUID(), { command: value }));
  };
  const template: MenuItemConstructorOptions[] = [
    {
      label: t("menu.file"),
      submenu: [
        { label: t("menu.openScore"), accelerator: "CmdOrCtrl+O", click: command("open-score") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: t("menu.playback"),
      submenu: [{ label: t("menu.togglePlayback"), accelerator: "Space", click: command("toggle-playback") }],
    },
    {
      label: t("menu.help"),
      submenu: [
        {
          id: "export-diagnostics",
          label: t("menu.exportDiagnostics"),
          click: () => {
            const parent = options.getWindow();
            void options.diagnostics
              .export(parent, {
                title: t("dialog.diagnosticExportTitle"),
                buttonLabel: t("dialog.diagnosticExportButton"),
                filterName: t("dialog.diagnosticExportFileType"),
              })
              .then((result) => {
                if (result.status !== "failed") return;
                const message = {
                  type: "error" as const,
                  title: t("dialog.diagnosticExportErrorTitle"),
                  message: t("errors:desktop.diagnosticExportFailed"),
                };
                return parent ? dialog.showMessageBox(parent, message) : dialog.showMessageBox(message);
              })
              .catch(() => undefined);
          },
        },
      ],
    },
    ...(app.isPackaged
      ? []
      : [
          {
            label: t("menu.development"),
            submenu: [
              {
                label: t("menu.openDiagnosticsDirectory"),
                click: () => {
                  void options.openDiagnosticsDirectory().catch(() => undefined);
                },
              },
              { type: "separator" as const },
              { role: "toggleDevTools" as const },
            ],
          },
        ]),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
