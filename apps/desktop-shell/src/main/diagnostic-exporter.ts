import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { dialog, type BrowserWindow, type SaveDialogOptions } from "electron";
import { persistedHostDiagnosticEventSchema } from "./diagnostics";
import type { DiagnosticStore } from "./diagnostic-store";

const gzipAsync = promisify(gzip);

type ExportDialogResult = { canceled: boolean; filePath?: string };
type DiagnosticExporterDependencies = {
  showSaveDialog?: (window: BrowserWindow | undefined, options: SaveDialogOptions) => Promise<ExportDialogResult>;
  writeFile?: (filePath: string, data: Uint8Array) => Promise<unknown>;
  now?: () => Date;
};

export type DiagnosticExportResult =
  { status: "saved" } | { status: "cancelled" } | { status: "failed"; code: "DIAGNOSTIC_EXPORT_FAILED" };

export class DiagnosticExporter {
  private readonly showSaveDialog: NonNullable<DiagnosticExporterDependencies["showSaveDialog"]>;
  private readonly writeFile: NonNullable<DiagnosticExporterDependencies["writeFile"]>;
  private readonly now: () => Date;

  constructor(
    private readonly store: DiagnosticStore,
    dependencies: DiagnosticExporterDependencies = {},
  ) {
    this.showSaveDialog = dependencies.showSaveDialog ?? defaultShowSaveDialog;
    this.writeFile = dependencies.writeFile ?? ((filePath, data) => writeFile(filePath, data, { mode: 0o600 }));
    this.now = dependencies.now ?? (() => new Date());
  }

  async export(
    window: BrowserWindow | undefined,
    labels: { title: string; buttonLabel: string; filterName: string },
  ): Promise<DiagnosticExportResult> {
    try {
      const result = await this.showSaveDialog(window, {
        title: labels.title,
        buttonLabel: labels.buttonLabel,
        defaultPath: `zupulse-diagnostics-${formatUtc(this.now())}.jsonl.gz`,
        filters: [{ name: labels.filterName, extensions: ["gz"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      if (result.canceled || !result.filePath) return { status: "cancelled" };

      const snapshot = await this.store.snapshot();
      const lines = snapshot.split("\n").flatMap((line) => {
        if (!line) return [];
        try {
          const event = persistedHostDiagnosticEventSchema.safeParse(JSON.parse(line));
          return event.success ? [JSON.stringify(event.data)] : [];
        } catch {
          return [];
        }
      });
      const jsonl = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
      await this.writeFile(result.filePath, await gzipAsync(jsonl));
      return { status: "saved" };
    } catch {
      return { status: "failed", code: "DIAGNOSTIC_EXPORT_FAILED" };
    }
  }
}

function defaultShowSaveDialog(
  window: BrowserWindow | undefined,
  options: SaveDialogOptions,
): Promise<ExportDialogResult> {
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
}

function formatUtc(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
