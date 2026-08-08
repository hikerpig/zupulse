import { diagnosticEventSchema } from "@zupulse/web-core";
import { z } from "zod";
import type { BrowserWindow } from "electron";
import { DiagnosticExporter, type DiagnosticExportResult } from "./diagnostic-exporter";
import { DiagnosticStore } from "./diagnostic-store";

const diagnosticReasonSchema = z.enum([
  "clean-exit",
  "abnormal-exit",
  "killed",
  "crashed",
  "oom",
  "launch-failed",
  "integrity-failure",
]);

const diagnosticInputSchema = diagnosticEventSchema
  .extend({
    reason: diagnosticReasonSchema.optional(),
    exitCode: z.number().int().min(-2147483648).max(2147483647).optional(),
  })
  .strict();

export const persistedHostDiagnosticEventSchema = diagnosticInputSchema
  .extend({
    schemaVersion: z.literal(1),
    at: z.iso.datetime(),
    appVersion: z.string().min(1).max(128),
    electronVersion: z.string().min(1).max(128),
    platform: z.enum([
      "aix",
      "android",
      "darwin",
      "freebsd",
      "haiku",
      "linux",
      "openbsd",
      "sunos",
      "win32",
      "cygwin",
      "netbsd",
    ]),
    arch: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9_]+$/),
    source: z.enum(["main", "renderer", "electron"]),
  })
  .strict();

type DesktopDiagnosticsOptions = {
  directory: string;
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  now?: () => Date;
};

export class DesktopDiagnostics {
  private readonly store: DiagnosticStore;
  private readonly exporter: DiagnosticExporter;
  private readonly now: () => Date;

  constructor(private readonly options: DesktopDiagnosticsOptions) {
    this.now = options.now ?? (() => new Date());
    this.store = new DiagnosticStore(options.directory, { now: this.now });
    this.exporter = new DiagnosticExporter(this.store, { now: this.now });
  }

  async initialize(): Promise<void> {
    await this.store.initialize().catch(() => undefined);
  }

  recordMain(value: unknown): Promise<void> {
    return this.record("main", value);
  }

  recordRenderer(value: unknown): Promise<void> {
    return this.record("renderer", value);
  }

  recordElectron(value: unknown): Promise<void> {
    return this.record("electron", value);
  }

  export(
    window: BrowserWindow | undefined,
    labels: { title: string; buttonLabel: string; filterName: string },
  ): Promise<DiagnosticExportResult> {
    return this.exporter.export(window, labels);
  }

  private async record(source: "main" | "renderer" | "electron", value: unknown): Promise<void> {
    const input = diagnosticInputSchema.safeParse(value);
    if (!input.success) return;
    const event = persistedHostDiagnosticEventSchema.safeParse({
      ...input.data,
      schemaVersion: 1,
      at: this.now().toISOString(),
      appVersion: this.options.appVersion,
      electronVersion: this.options.electronVersion,
      platform: this.options.platform,
      arch: this.options.arch,
      source,
    });
    if (!event.success) return;
    await this.store.append(`${JSON.stringify(event.data)}\n`).catch(() => undefined);
  }
}
