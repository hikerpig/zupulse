import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createBridgeEvent, type BridgeEvent, type PdfOmrProgressEvent } from "@zupulse/web-core";
import { encodeRgbaPng, readPdfPageCount, renderPdfPages } from "@zupulse/pdf-omr-cli/pipeline";
import type { SupportedLocale } from "@zupulse/app-i18n";
import { dialog } from "electron";
import { BridgeDispatchError, type RequiredBridgeHandlers } from "../bridge/dispatcher";
import { type PdfOmrLogEvent, DesktopDiagnostics } from "../diagnostics/desktop-diagnostics";
import type { FileTokenStore } from "../file-access/file-token-store";
import { materializePdfOmrInput, selectMidiFile, selectPdfFile } from "../file-access/score-files";
import { PdfOmrJobController } from "./pdf-omr-controller";
import { preflightPdfOmrEngines, resolveAudiverisExecutable } from "./pdf-omr-engine-preflight";
import { PdfOmrMidiCorrectionController } from "./pdf-omr-midi-correction-controller";
import { DesktopPdfOmrRuntime } from "./pdf-omr-runtime";
import { RecognitionProviderConfigurationStore } from "./provider-configuration-store";
import { RecognitionProviderSettings, RecognitionSettingsError } from "./provider-settings";

type RecognitionHandlers = RequiredBridgeHandlers<
  | "recognitionSettings.list"
  | "recognitionSettings.selectResource"
  | "recognitionSettings.save"
  | "recognitionSettings.clear"
  | "pdfOmr.select"
  | "pdfOmr.start"
  | "pdfOmr.retry"
  | "pdfOmr.cancel"
  | "pdfOmr.markExported"
  | "pdfOmr.getSnapshot"
  | "pdfOmr.readResult"
  | "pdfOmr.readInputPreview"
  | "pdfOmr.selectMidi"
  | "pdfOmr.analyzeMidi"
  | "pdfOmr.applyMidiCorrections"
>;

export async function createRecognitionModule(options: {
  userData: string;
  homeDirectory: string;
  platform: NodeJS.Platform;
  fileTokens: FileTokenStore;
  getLocale(): SupportedLocale;
  sendEvent(event: BridgeEvent): void;
  diagnostics: DesktopDiagnostics;
}) {
  const audiverisExecutable = await resolveAudiverisExecutable({
    homeDirectory: options.homeDirectory,
    platform: options.platform,
  });
  const settings = await RecognitionProviderSettings.create({
    store: new RecognitionProviderConfigurationStore(options.userData),
    automaticAudiverisExecutable: audiverisExecutable,
  });
  const pdfOmrEngines = await preflightPdfOmrEngines(settings.createRegistrySnapshot());
  const runtime = new DesktopPdfOmrRuntime({
    engineRegistryProvider: () => settings.createRegistrySnapshot(),
  });
  const controller = new PdfOmrJobController(runtime);
  const corrections = new PdfOmrMidiCorrectionController(controller);
  const previewCache = new Map<string, Map<number, Promise<Uint8Array | undefined>>>();
  const startedAt = new Map<string, number>();
  const heartbeats = new Map<string, ReturnType<typeof setInterval>>();
  const loggedTerminals = new Set<string>();
  let disposed = false;

  const logPdfOmr = (event: PdfOmrLogEvent): void => {
    console.info(`[PDF OMR] ${event.code}`, event);
    void options.diagnostics.recordPdfOmr(event).catch(() => undefined);
  };
  controller.subscribeProgress((jobId, event) => {
    options.sendEvent(
      createBridgeEvent("pdfOmr.progress", randomUUID(), {
        jobId,
        event: event as PdfOmrProgressEvent,
      }),
    );
    if (event.kind === "stage") {
      logPdfOmr({ code: "PDF_OMR_STAGE", jobId, stage: event.stage, status: event.status });
    } else if (event.kind === "engine-progress") {
      logPdfOmr({
        code: "PDF_OMR_ENGINE_PROGRESS",
        jobId,
        stage: event.stage,
        unit: event.unit,
        completed: event.completed,
        total: event.total,
      });
    }
  });
  controller.subscribe((snapshot) => {
    if (snapshot.status !== "succeeded" && snapshot.status !== "failed" && snapshot.status !== "cancelled") return;
    if (loggedTerminals.has(snapshot.jobId)) return;
    loggedTerminals.add(snapshot.jobId);
    clearHeartbeat(snapshot.jobId, heartbeats);
    const jobStartedAt = startedAt.get(snapshot.jobId);
    startedAt.delete(snapshot.jobId);
    logPdfOmr({
      code: "PDF_OMR_COMPLETED",
      jobId: snapshot.jobId,
      status: snapshot.status,
      ...(snapshot.error?.code === undefined ? {} : { errorCode: snapshot.error.code }),
      ...(jobStartedAt === undefined ? {} : { durationMs: Date.now() - jobStartedAt }),
    });
  });

  const beginPdfOmrLog = (jobId: string): void => {
    startedAt.set(jobId, Date.now());
    const heartbeat = setInterval(() => {
      const snapshot = controller.getSnapshot();
      if (
        snapshot?.jobId !== jobId ||
        snapshot.status === "succeeded" ||
        snapshot.status === "failed" ||
        snapshot.status === "cancelled"
      ) {
        clearHeartbeat(jobId, heartbeats);
        return;
      }
      logPdfOmr({
        code: "PDF_OMR_HEARTBEAT",
        jobId,
        durationMs: Date.now() - (startedAt.get(jobId) ?? Date.now()),
      });
    }, 10_000);
    heartbeat.unref();
    heartbeats.set(jobId, heartbeat);
  };

  const handlers: RecognitionHandlers = {
    "recognitionSettings.list": () => settings.list().then((providers) => ({ providers })),
    "recognitionSettings.selectResource": async (request) => {
      try {
        let selectedPath = request.payload.path;
        if (selectedPath === undefined) {
          const kind = recognitionResourceKind(request.payload.providerId, request.payload.fieldId);
          const result = await dialog.showOpenDialog({
            properties: kind === "directory" ? ["openDirectory"] : ["openFile"],
          });
          selectedPath = result.filePaths[0];
          if (result.canceled || !selectedPath) return { status: "cancelled" };
        }
        return {
          status: "selected",
          ...settings.registerSelection(request.payload.providerId, request.payload.fieldId, selectedPath),
        };
      } catch (error) {
        throw recognitionBridgeError(error);
      }
    },
    "recognitionSettings.save": async (request) => {
      try {
        return await settings.save(request.payload);
      } catch (error) {
        throw recognitionBridgeError(error);
      }
    },
    "recognitionSettings.clear": async (request) => {
      try {
        return await settings.clear(request.payload.providerId);
      } catch (error) {
        throw recognitionBridgeError(error);
      }
    },
    "pdfOmr.select": () => selectPdfFile(options.fileTokens, undefined, options.getLocale()),
    "pdfOmr.start": async (request) => {
      await assertRecognitionProviderReady(settings, request.payload.engineId);
      const jobDirectory = path.join(options.userData, "pdf-omr", randomUUID());
      const file = await materializePdfOmrInput(
        options.fileTokens,
        request.payload.fileToken,
        path.join(jobDirectory, "input"),
      );
      const snapshot = controller.start({
        inputPath: file.path,
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        inputKind: /\.(png|jpe?g)$/i.test(file.fileName) ? "image" : "pdf",
        engineId: request.payload.engineId,
        outputDirectory: path.join(jobDirectory, "output"),
      });
      beginPdfOmrLog(snapshot.jobId);
      logPdfOmr({ code: "PDF_OMR_STARTED", jobId: snapshot.jobId, engineId: request.payload.engineId });
      return { jobId: snapshot.jobId, snapshot };
    },
    "pdfOmr.retry": async (request) => {
      await assertRecognitionProviderReady(settings, request.payload.engineId);
      const snapshot = controller.retry(
        request.payload.jobId,
        request.payload.engineId,
        path.join(options.userData, "pdf-omr", randomUUID()),
      );
      beginPdfOmrLog(snapshot.jobId);
      logPdfOmr({ code: "PDF_OMR_RETRY_STARTED", jobId: snapshot.jobId, engineId: request.payload.engineId });
      return { jobId: snapshot.jobId, snapshot };
    },
    "pdfOmr.cancel": (request) => {
      controller.cancel(request.payload.jobId);
      return {};
    },
    "pdfOmr.markExported": (request) => {
      controller.setExported(request.payload.jobId, true);
      return {};
    },
    "pdfOmr.getSnapshot": () => ({ snapshot: controller.getSnapshot() ?? null }),
    "pdfOmr.readResult": (request) => readPdfOmrResult(controller, corrections, request.payload.jobId),
    "pdfOmr.readInputPreview": (request) =>
      readPdfOmrInputPreview(controller, runtime, previewCache, request.payload.jobId, request.payload.pageIndex),
    "pdfOmr.selectMidi": () => selectMidiFile(options.fileTokens, undefined, options.getLocale()),
    "pdfOmr.analyzeMidi": (request) => {
      const midi = options.fileTokens.consume(request.payload.fileToken);
      return corrections.analyze({
        jobId: request.payload.jobId,
        midiPath: midi.path,
        midiFileName: midi.fileName,
        outputDirectory: path.join(options.userData, "pdf-omr", randomUUID(), "midi-fusion"),
      });
    },
    "pdfOmr.applyMidiCorrections": (request) =>
      corrections
        .apply({
          jobId: request.payload.jobId,
          decisions: request.payload.decisions,
          outputDirectory: path.join(options.userData, "pdf-omr", randomUUID(), "midi-writeback"),
        })
        .then((result) => {
          controller.setExported(request.payload.jobId, false);
          return result;
        }),
  };

  return {
    handlers,
    pdfOmrEngines,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      runtime.cancel();
      for (const heartbeat of heartbeats.values()) clearInterval(heartbeat);
      heartbeats.clear();
      startedAt.clear();
    },
  };
}

function clearHeartbeat(jobId: string, heartbeats: Map<string, ReturnType<typeof setInterval>>): void {
  const heartbeat = heartbeats.get(jobId);
  if (heartbeat !== undefined) clearInterval(heartbeat);
  heartbeats.delete(jobId);
}

function recognitionResourceKind(
  providerId: "audiveris" | "rokot" | "legato",
  fieldId: string,
): "executable" | "file" | "directory" {
  if (fieldId === "repository" || fieldId === "baseModel") return "directory";
  if (["model", "visionProjector"].includes(fieldId)) return "file";
  if (providerId === "audiveris" || fieldId === "python" || fieldId === "llamaCli") return "executable";
  throw new BridgeDispatchError("INVALID_RECOGNITION_RESOURCE_FIELD", "Unknown provider resource field", false);
}

function recognitionBridgeError(error: unknown): BridgeDispatchError {
  if (error instanceof RecognitionSettingsError) {
    return new BridgeDispatchError("RECOGNITION_SETTINGS_VALIDATION_FAILED", error.message, true, {
      reason: error.reason,
    });
  }
  return new BridgeDispatchError("RECOGNITION_SETTINGS_FAILED", "Recognition settings operation failed", true);
}

async function assertRecognitionProviderReady(settings: RecognitionProviderSettings, engineId: string): Promise<void> {
  const provider = (await settings.list()).find((candidate) => candidate.id === engineId);
  if (provider?.state === "ready") return;
  throw new BridgeDispatchError("PDF_OMR_ENGINE_UNAVAILABLE", "Recognition provider preflight failed", true, {
    reason: provider?.reason ?? "missing-configuration",
  });
}

type PdfOmrInputPreview =
  | { status: "unavailable" }
  | {
      status: "available";
      pageIndex: number;
      pageCount: number;
      contentType: "image/png" | "image/jpeg";
      bytes: Uint8Array;
    };

const PDF_OMR_PREVIEW_MAX_PAGES = 64;

async function readPdfOmrInputPreview(
  controller: PdfOmrJobController,
  runtime: DesktopPdfOmrRuntime,
  cache: Map<string, Map<number, Promise<Uint8Array | undefined>>>,
  jobId: string,
  pageIndex: number,
): Promise<PdfOmrInputPreview> {
  const input = controller.getJobInput(jobId);
  if (input === undefined) return { status: "unavailable" };
  if (input.inputKind === "image") {
    const bytes = new Uint8Array(await readFile(input.inputPath).catch(() => new ArrayBuffer(0)));
    if (bytes.byteLength === 0 || bytes.byteLength > 64 * 1024 * 1024 || pageIndex !== 0) {
      return { status: "unavailable" };
    }
    return {
      status: "available",
      pageIndex: 0,
      pageCount: 1,
      contentType: /\.jpe?g$/i.test(input.fileName) ? "image/jpeg" : "image/png",
      bytes,
    };
  }
  for (const key of [...cache.keys()]) {
    if (key !== jobId) cache.delete(key);
  }
  const source = new Uint8Array(await readFile(input.inputPath).catch(() => new ArrayBuffer(0)));
  if (source.byteLength === 0) return { status: "unavailable" };
  const assets = runtime.pdfjsAssetDirectories();
  const pageCount = await readPdfPageCount(source, assets).catch(() => undefined);
  if (pageCount === undefined || pageCount > PDF_OMR_PREVIEW_MAX_PAGES || pageIndex >= pageCount) {
    return { status: "unavailable" };
  }
  let jobCache = cache.get(jobId);
  if (jobCache === undefined) {
    jobCache = new Map();
    cache.set(jobId, jobCache);
  }
  let page = jobCache.get(pageIndex);
  if (page === undefined) {
    page = renderPdfPages(source, { targetWidth: 1000, allowLandscape: true, pageIndex, ...assets })
      .then((pages) => {
        const rendered = pages[0];
        return rendered === undefined
          ? undefined
          : encodeRgbaPng(rendered.pixelWidth, rendered.pixelHeight, Uint8Array.from(rendered.pixels));
      })
      .catch(() => undefined);
    jobCache.set(pageIndex, page);
  }
  const bytes = await page;
  if (bytes === undefined) return { status: "unavailable" };
  return { status: "available", pageIndex, pageCount, contentType: "image/png", bytes };
}

type PdfOmrValidationReadiness = {
  harmony: "blocked" | "ready-with-warnings" | "ready";
  musicXml: "blocked" | "ready-with-warnings" | "ready";
};
type PdfOmrValidationView = {
  readiness: PdfOmrValidationReadiness;
  diagnostics: readonly { code: string; severity: "blocking" | "warning" | "info" }[];
};

async function readPdfOmrResult(
  controller: PdfOmrJobController,
  corrections: PdfOmrMidiCorrectionController,
  jobId: string,
): Promise<
  | { status: "unavailable" }
  | {
      status: "available";
      fileName: string;
      bytes: Uint8Array;
      outputSha256: string;
      validation: PdfOmrValidationView;
    }
  | { status: "failed-validation"; validation: PdfOmrValidationView }
> {
  const completed = controller.getCompletedResult(jobId);
  if (completed === undefined) {
    const failedDirectory = controller.getFailedValidationDirectory(jobId);
    if (failedDirectory === undefined) return { status: "unavailable" };
    const failedValidation = await readPdfOmrValidation(path.join(failedDirectory, "validation.json"));
    return failedValidation === undefined
      ? { status: "unavailable" }
      : { status: "failed-validation", validation: failedValidation };
  }
  const corrected = corrections.getCorrectedResult(jobId);
  const bytes = new Uint8Array(
    await readFile(corrected?.path ?? path.join(completed.outputDirectory, completed.result.artifacts.musicXml)),
  );
  if (bytes.byteLength > 64 * 1024 * 1024) {
    throw new BridgeDispatchError("FILE_TOO_LARGE", "PDF OMR result is too large", false);
  }
  const validation = (await readPdfOmrValidation(
    path.join(completed.outputDirectory, completed.result.artifacts.validation),
  )) ?? { readiness: completed.result.validation.readiness, diagnostics: [] };
  return {
    status: "available",
    fileName: corrected?.fileName ?? "score.mxl",
    bytes,
    outputSha256: corrected?.outputSha256 ?? completed.result.outputSha256,
    validation,
  };
}

async function readPdfOmrValidation(filePath: string): Promise<PdfOmrValidationView | undefined> {
  const text = await readFile(filePath, "utf8").catch(() => undefined);
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const readiness = parsePdfOmrReadiness((raw as { readiness?: unknown }).readiness);
  if (readiness === undefined) return undefined;
  const rawDiagnostics = (raw as { diagnostics?: unknown }).diagnostics;
  const diagnostics = Array.isArray(rawDiagnostics)
    ? rawDiagnostics
        .slice(0, 512)
        .filter(isSafePdfOmrDiagnostic)
        .map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity }))
    : [];
  return { readiness, diagnostics };
}

function parsePdfOmrReadiness(value: unknown): PdfOmrValidationReadiness | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const readiness = value as { harmony?: unknown; musicXml?: unknown };
  if (!isPdfOmrReadinessValue(readiness.harmony) || !isPdfOmrReadinessValue(readiness.musicXml)) return undefined;
  return { harmony: readiness.harmony, musicXml: readiness.musicXml };
}

function isPdfOmrReadinessValue(value: unknown): value is "blocked" | "ready-with-warnings" | "ready" {
  return value === "blocked" || value === "ready-with-warnings" || value === "ready";
}

function isSafePdfOmrDiagnostic(value: unknown): value is { code: string; severity: "blocking" | "warning" | "info" } {
  if (typeof value !== "object" || value === null) return false;
  const diagnostic = value as { code?: unknown; severity?: unknown };
  return (
    typeof diagnostic.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(diagnostic.code) &&
    (diagnostic.severity === "blocking" || diagnostic.severity === "warning" || diagnostic.severity === "info")
  );
}
