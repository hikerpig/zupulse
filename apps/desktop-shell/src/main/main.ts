import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  createBridgeEvent,
  fileImportDroppedRequestSchema,
  localPlaybackResumeSchema,
  parseSidecar,
  type PdfOmrProgressEvent,
} from "@zupulse/web-core";
import { createAppI18n, resolveLocale, type LocaleState, type SupportedLocale } from "@zupulse/app-i18n";
import { randomUUID } from "node:crypto";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  protocol,
  session,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { assertBridgeAppSender, BridgeDispatchError, createDesktopCapabilities, dispatchBridgeRequest } from "./bridge";
import { DesktopDiagnostics, type PdfOmrLogEvent } from "./diagnostics";
import {
  installAppDiagnosticInstrumentation,
  installWindowDiagnosticInstrumentation,
  recordBridgeFailure,
  recordPersistedDataCorruption,
} from "./diagnostic-instrumentation";
import { FileTokenStore } from "./fileTokens";
import {
  acceptScorePaths,
  materializePdfOmrInput,
  readScoreFileBytes,
  saveScoreFile,
  selectMidiFile,
  selectPdfFile,
  selectScoreFiles,
} from "./files";
import { registerAppProtocol } from "./protocol";
import { JsonStore } from "./storage";
import { DesktopLifecycleCoordinator } from "./lifecycle";
import { DesktopLibraryStore } from "./library/DesktopLibraryStore";
import { verifySqliteAvailable } from "./library/sqlite";
import { LocalePreferenceStore } from "./locale-preference-store";
import { openExternalUrl } from "./external-navigation";
import { DesktopPdfOmrRuntime } from "./pdf-omr-runtime";
import { PdfOmrJobController } from "./pdf-omr-controller";
import { PdfOmrMidiCorrectionController } from "./pdf-omr-midi-correction-controller";
import { preflightPdfOmrEngines, resolveAudiverisExecutable } from "./pdf-omr-engine-preflight";
import { RecognitionProviderConfigurationStore } from "./recognition-provider-configuration-store";
import { RecognitionProviderSettings, RecognitionSettingsError } from "./recognition-provider-settings";

function recognitionResourceKind(
  providerId: "audiveris" | "rokot" | "legato" | "transcoda",
  fieldId: string,
): "executable" | "file" | "directory" {
  if (fieldId === "repository" || fieldId === "baseModel") return "directory";
  if (["model", "visionProjector", "checkpoint"].includes(fieldId)) return "file";
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: "zupulse",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

const fileTokens = new FileTokenStore();
let mainWindow: BrowserWindow | undefined;
let lifecycle: DesktopLifecycleCoordinator | undefined;

function getRuntimeIconPath(): string {
  return path.join(app.getAppPath(), "resources/app-icon.png");
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: "#1a1a1a",
    icon: getRuntimeIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void window.loadURL("zupulse://app/index.html");
  return window;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void app.whenReady().then(startDesktopApp);
}

async function startDesktopApp(): Promise<void> {
  const dock = process.platform === "darwin" && !app.isPackaged ? app.dock : undefined;
  if (dock) dock.setIcon(getRuntimeIconPath());
  app.setAppLogsPath();
  const logDirectory = app.getPath("logs");
  const diagnostics = new DesktopDiagnostics({
    directory: logDirectory,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
  });
  await diagnostics.initialize();
  installAppDiagnosticInstrumentation(app, diagnostics);
  try {
    const rendererRoot = path.join(__dirname, "../renderer");
    const userData = app.getPath("userData");
    const localePreferenceStore = new LocalePreferenceStore(userData);
    const initialPreference = await localePreferenceStore.load();
    let currentLocaleState: LocaleState = {
      preference: initialPreference,
      effectiveLocale: resolveLocale(initialPreference, app.getPreferredSystemLanguages()),
    };
    const audiverisExecutable = await resolveAudiverisExecutable({
      homeDirectory: app.getPath("home"),
      platform: process.platform,
    });
    const recognitionSettings = await RecognitionProviderSettings.create({
      store: new RecognitionProviderConfigurationStore(userData),
      automaticAudiverisExecutable: audiverisExecutable,
    });
    const pdfOmrEngines = await preflightPdfOmrEngines(recognitionSettings.createRegistrySnapshot());
    const pdfOmrRuntime = new DesktopPdfOmrRuntime({
      engineRegistryProvider: () => recognitionSettings.createRegistrySnapshot(),
    });
    const desktopCapabilities = createDesktopCapabilities(pdfOmrEngines);
    verifySqliteAvailable();
    const sendStorageWarning = (category: "sidecar" | "resume") => (code: "CORRUPT_PERSISTED_DATA") => {
      recordPersistedDataCorruption(diagnostics, category);
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send(
        "zupulse:event",
        createBridgeEvent("storage.warning", randomUUID(), { code, category }),
      );
    };
    const sidecarStore = new JsonStore(userData, "sidecars", { parse: parseSidecar }, sendStorageWarning("sidecar"));
    const resumeStore = new JsonStore(userData, "resume", localPlaybackResumeSchema, sendStorageWarning("resume"));
    const library = new DesktopLibraryStore(path.join(userData, "library.sqlite"), path.join(userData, "library"), {
      readSidecar: (libraryScoreId) => sidecarStore.read(libraryScoreId),
      readResume: (libraryScoreId) => resumeStore.read(libraryScoreId),
    });
    await library.initialize();
    app.once("will-quit", () => {
      pdfOmrRuntime.cancel();
      library.close();
    });
    const openDiagnosticsDirectory = async () => {
      const error = await shell.openPath(logDirectory);
      if (error) throw new Error("DIAGNOSTICS_OPEN_DIRECTORY_FAILED");
    };
    registerAppProtocol(rendererRoot);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    const sendEvent = (event: ReturnType<typeof createBridgeEvent>) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("zupulse:event", event);
    };
    const pdfOmrController = new PdfOmrJobController(pdfOmrRuntime);
    const pdfOmrMidiCorrections = new PdfOmrMidiCorrectionController(pdfOmrController);
    const pdfOmrStartedAt = new Map<string, number>();
    const pdfOmrHeartbeats = new Map<string, ReturnType<typeof setInterval>>();
    const loggedPdfOmrTerminals = new Set<string>();
    const logPdfOmr = (event: PdfOmrLogEvent): void => {
      console.info(`[PDF OMR] ${event.code}`, event);
      void diagnostics.recordPdfOmr(event).catch(() => undefined);
    };
    pdfOmrController.subscribeProgress((jobId, event) => {
      sendEvent(
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
    pdfOmrController.subscribe((snapshot) => {
      if (snapshot.status !== "succeeded" && snapshot.status !== "failed" && snapshot.status !== "cancelled") return;
      if (loggedPdfOmrTerminals.has(snapshot.jobId)) return;
      loggedPdfOmrTerminals.add(snapshot.jobId);
      const heartbeat = pdfOmrHeartbeats.get(snapshot.jobId);
      if (heartbeat !== undefined) {
        clearInterval(heartbeat);
        pdfOmrHeartbeats.delete(snapshot.jobId);
      }
      const startedAt = pdfOmrStartedAt.get(snapshot.jobId);
      pdfOmrStartedAt.delete(snapshot.jobId);
      logPdfOmr({
        code: "PDF_OMR_COMPLETED",
        jobId: snapshot.jobId,
        status: snapshot.status,
        ...(snapshot.error?.code === undefined ? {} : { errorCode: snapshot.error.code }),
        ...(startedAt === undefined ? {} : { durationMs: Date.now() - startedAt }),
      });
    });
    const beginPdfOmrLog = (jobId: string): void => {
      pdfOmrStartedAt.set(jobId, Date.now());
      const heartbeat = setInterval(() => {
        const snapshot = pdfOmrController.getSnapshot();
        if (
          snapshot?.jobId !== jobId ||
          snapshot.status === "succeeded" ||
          snapshot.status === "failed" ||
          snapshot.status === "cancelled"
        ) {
          clearInterval(heartbeat);
          pdfOmrHeartbeats.delete(jobId);
          return;
        }
        logPdfOmr({
          code: "PDF_OMR_HEARTBEAT",
          jobId,
          durationMs: Date.now() - (pdfOmrStartedAt.get(jobId) ?? Date.now()),
        });
      }, 10_000);
      heartbeat.unref();
      pdfOmrHeartbeats.set(jobId, heartbeat);
    };
    const DROPPED_FILES_IPC_CHANNEL = "zupulse:file:importDropped" as const;
    ipcMain.handle(DROPPED_FILES_IPC_CHANNEL, (event, value: unknown) => {
      try {
        assertBridgeAppSender(event.senderFrame?.url ?? event.sender.getURL());
        const parsed = fileImportDroppedRequestSchema.safeParse(value);
        if (!parsed.success) {
          throw new BridgeDispatchError(
            "INVALID_BRIDGE_MESSAGE",
            "Dropped-file import failed schema validation",
            false,
            parsed.error.issues,
          );
        }
        return acceptScorePaths(fileTokens, parsed.data.payload.paths);
      } catch (error) {
        recordBridgeFailure(diagnostics, error);
        throw error;
      }
    });
    ipcMain.handle("zupulse:request", async (event, value: unknown) => {
      try {
        return await dispatchBridgeRequest(
          {
            senderUrl: event.senderFrame?.url ?? event.sender.getURL(),
            value,
          },
          {
            appVersion: __APP_VERSION__,
            rendererBuildHash: __RENDERER_BUILD_HASH__,
            locale: currentLocaleState,
            capabilities: desktopCapabilities,
            handlers: {
              "external.openUrl": (request) => openExternalUrl(request, (url) => shell.openExternal(url)),
              "app.locale.setPreference": async (request) => {
                try {
                  await localePreferenceStore.save(request.payload.preference);
                } catch {
                  throw new BridgeDispatchError(
                    "LOCALE_PREFERENCE_WRITE_FAILED",
                    "Locale preference could not be persisted",
                    true,
                  );
                }
                currentLocaleState = {
                  preference: request.payload.preference,
                  effectiveLocale: resolveLocale(request.payload.preference, app.getPreferredSystemLanguages()),
                };
                installMenu(sendEvent, diagnostics, openDiagnosticsDirectory, currentLocaleState.effectiveLocale);
                return currentLocaleState;
              },
              "recognitionSettings.list": () => recognitionSettings.list().then((providers) => ({ providers })),
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
                    ...recognitionSettings.registerSelection(
                      request.payload.providerId,
                      request.payload.fieldId,
                      selectedPath,
                    ),
                  };
                } catch (error) {
                  throw recognitionBridgeError(error);
                }
              },
              "recognitionSettings.save": async (request) => {
                try {
                  return await recognitionSettings.save(request.payload);
                } catch (error) {
                  throw recognitionBridgeError(error);
                }
              },
              "recognitionSettings.clear": async (request) => {
                try {
                  return await recognitionSettings.clear(request.payload.providerId);
                } catch (error) {
                  throw recognitionBridgeError(error);
                }
              },
              "file.select": (request) =>
                selectScoreFiles(fileTokens, request.payload.multiple, currentLocaleState.effectiveLocale),
              "pdfOmr.select": () => selectPdfFile(fileTokens, undefined, currentLocaleState.effectiveLocale),
              "pdfOmr.start": async (request) => {
                await assertRecognitionProviderReady(recognitionSettings, request.payload.engineId);
                const jobDirectory = path.join(userData, "pdf-omr", randomUUID());
                const outputDirectory = path.join(jobDirectory, "output");
                const file = await materializePdfOmrInput(
                  fileTokens,
                  request.payload.fileToken,
                  path.join(jobDirectory, "input"),
                );
                const snapshot = pdfOmrController.start({
                  inputPath: file.path,
                  fileName: file.fileName,
                  sizeBytes: file.sizeBytes,
                  inputKind: /\.(png|jpe?g)$/i.test(file.fileName) ? "image" : "pdf",
                  engineId: request.payload.engineId,
                  outputDirectory,
                });
                beginPdfOmrLog(snapshot.jobId);
                logPdfOmr({ code: "PDF_OMR_STARTED", jobId: snapshot.jobId, engineId: request.payload.engineId });
                return { jobId: snapshot.jobId, snapshot };
              },
              "pdfOmr.retry": async (request) => {
                await assertRecognitionProviderReady(recognitionSettings, request.payload.engineId);
                const snapshot = pdfOmrController.retry(
                  request.payload.jobId,
                  request.payload.engineId,
                  path.join(userData, "pdf-omr", randomUUID()),
                );
                beginPdfOmrLog(snapshot.jobId);
                logPdfOmr({
                  code: "PDF_OMR_RETRY_STARTED",
                  jobId: snapshot.jobId,
                  engineId: request.payload.engineId,
                });
                return { jobId: snapshot.jobId, snapshot };
              },
              "pdfOmr.cancel": (request) => {
                pdfOmrController.cancel(request.payload.jobId);
                return {};
              },
              "pdfOmr.getSnapshot": () => ({ snapshot: pdfOmrController.getSnapshot() ?? null }),
              "pdfOmr.readResult": async (request) =>
                readPdfOmrResult(pdfOmrController, pdfOmrMidiCorrections, request.payload.jobId),
              "pdfOmr.selectMidi": () => selectMidiFile(fileTokens, undefined, currentLocaleState.effectiveLocale),
              "pdfOmr.analyzeMidi": (request) => {
                const midi = fileTokens.consume(request.payload.fileToken);
                return pdfOmrMidiCorrections.analyze({
                  jobId: request.payload.jobId,
                  midiPath: midi.path,
                  midiFileName: midi.fileName,
                  outputDirectory: path.join(userData, "pdf-omr", randomUUID(), "midi-fusion"),
                });
              },
              "pdfOmr.applyMidiCorrections": (request) =>
                pdfOmrMidiCorrections.apply({
                  jobId: request.payload.jobId,
                  decisions: request.payload.decisions,
                  outputDirectory: path.join(userData, "pdf-omr", randomUUID(), "midi-writeback"),
                }),
              "file.readBytes": (request) => readScoreFileBytes(fileTokens, request.payload.fileToken),
              "file.save": (request) => saveScoreFile(request.payload, currentLocaleState.effectiveLocale),
              "library.list": async () => ({ scores: await library.list() }),
              "library.get": async (request) => ({ score: await library.get(request.payload.id) }),
              "library.find": async (request) => ({
                score: await library.findByIdentity(request.payload.scoreIdentity),
              }),
              "library.add": async (request) => {
                const { parsedTitle, parsedArtist, durationMs, ...draft } = request.payload.draft;
                return library.add({
                  ...draft,
                  file: { ...draft.file, bytes: new Uint8Array(draft.file.bytes) },
                  ...(parsedTitle === undefined ? {} : { parsedTitle }),
                  ...(parsedArtist === undefined ? {} : { parsedArtist }),
                  ...(durationMs === undefined ? {} : { durationMs }),
                });
              },
              "library.readScore": async (request) => await library.readScore(request.payload.id),
              "library.updateMetadata": async (request) => ({
                score: await library.updateMetadata(request.payload.id, request.payload.patch),
              }),
              "library.setFavorite": async (request) => {
                await library.setFavorite(request.payload.id, request.payload.favorite);
                return {};
              },
              "library.markOpened": async (request) => {
                await library.markOpened(request.payload.id, request.payload.openedAt);
                return {};
              },
              "library.delete": async (request) => {
                await library.delete(request.payload.id);
                await Promise.all([sidecarStore.delete(request.payload.id), resumeStore.delete(request.payload.id)]);
                return {};
              },
              "harmonyAnalysis.read": async (request) => ({
                document: await library.read(request.payload.libraryScoreId),
              }),
              "harmonyAnalysis.save": async (request) => library.save(request.payload),
              "sidecar.read": async (request) => ({
                payload: await sidecarStore.read(
                  request.payload.libraryScoreId ?? request.payload.identity.contentHash,
                ),
              }),
              "sidecar.write": async (request) => {
                const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
                if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId)))
                  throw new Error("LIBRARY_SCORE_NOT_FOUND");
                await sidecarStore.write(key, request.payload.payload);
                return {};
              },
              "playbackResume.read": async (request) => ({
                resume: await resumeStore.read(request.payload.libraryScoreId ?? request.payload.identity.contentHash),
              }),
              "playbackResume.write": async (request) => {
                const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
                if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId)))
                  throw new Error("LIBRARY_SCORE_NOT_FOUND");
                await resumeStore.write(key, request.payload.resume);
                return {};
              },
              "diagnostics.write": async (request) => {
                await diagnostics.recordRenderer(request.payload);
                return {};
              },
              "app.lifecycleAck": (request) => {
                lifecycle?.acknowledge(request.payload.state);
                return {};
              },
            },
          },
        );
      } catch (error) {
        recordBridgeFailure(diagnostics, error);
        throw error;
      }
    });
    mainWindow = createMainWindow();
    installWindowDiagnosticInstrumentation(mainWindow, diagnostics);
    lifecycle = new DesktopLifecycleCoordinator(sendEvent, {
      timeoutMs: 5000,
      onTimeout: (code) => {
        void diagnostics.recordMain({ code });
      },
    });
    installLifecycle(mainWindow, lifecycle);
    installMenu(sendEvent, diagnostics, openDiagnosticsDirectory, currentLocaleState.effectiveLocale);
    void diagnostics.recordMain({ code: "APP_STARTED" });
  } catch (error) {
    await diagnostics.recordMain({ code: "APP_START_FAILED" });
    throw error;
  }
}

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
      validation: {
        readiness: {
          harmony: "blocked" | "ready-with-warnings" | "ready";
          musicXml: "blocked" | "ready-with-warnings" | "ready";
        };
        diagnostics: readonly { code: string; severity: "blocking" | "warning" | "info" }[];
      };
    }
> {
  const completed = controller.getCompletedResult(jobId);
  if (completed === undefined) return { status: "unavailable" };
  const corrected = corrections.getCorrectedResult(jobId);
  const bytes = new Uint8Array(
    await readFile(corrected?.path ?? path.join(completed.outputDirectory, completed.result.artifacts.musicXml)),
  );
  if (bytes.byteLength > 64 * 1024 * 1024)
    throw new BridgeDispatchError("FILE_TOO_LARGE", "PDF OMR result is too large", false);
  const raw = JSON.parse(
    await readFile(path.join(completed.outputDirectory, completed.result.artifacts.validation), "utf8"),
  ) as { readiness?: unknown; diagnostics?: unknown };
  const readiness = completed.result.validation.readiness;
  const diagnostics = Array.isArray(raw.diagnostics)
    ? raw.diagnostics
        .slice(0, 512)
        .filter(isSafePdfOmrDiagnostic)
        .map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity }))
    : [];
  return {
    status: "available",
    fileName: corrected?.fileName ?? "score.mxl",
    bytes,
    outputSha256: corrected?.outputSha256 ?? completed.result.outputSha256,
    validation: { readiness, diagnostics },
  };
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

function installLifecycle(window: BrowserWindow, coordinator: DesktopLifecycleCoordinator): void {
  let closeRequested = false;
  window.on("close", (event) => {
    if (closeRequested) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeRequested = true;
    void coordinator.prepareClose().finally(() => {
      fileTokens.clear();
      window.destroy();
      app.quit();
    });
  });
  powerMonitor.on("suspend", () => {
    void coordinator.request("suspend");
  });
  powerMonitor.on("lock-screen", () => {
    void coordinator.request("suspend");
  });
}

function installMenu(
  sendEvent: (event: ReturnType<typeof createBridgeEvent>) => void,
  diagnostics: DesktopDiagnostics,
  openDiagnosticsDirectory: () => Promise<void>,
  locale: SupportedLocale,
): void {
  const t = createAppI18n(locale).getFixedT(locale, "desktop");
  const command = (value: "open-score" | "toggle-playback") => () => {
    sendEvent(createBridgeEvent("app.command", randomUUID(), { command: value }));
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
            const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
            void diagnostics
              .export(parent, {
                title: t("dialog.diagnosticExportTitle"),
                buttonLabel: t("dialog.diagnosticExportButton"),
                filterName: t("dialog.diagnosticExportFileType"),
              })
              .then((result) => {
                if (result.status !== "failed") return;
                const options = {
                  type: "error" as const,
                  title: t("dialog.diagnosticExportErrorTitle"),
                  message: t("errors:desktop.diagnosticExportFailed"),
                };
                return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
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
                  void openDiagnosticsDirectory().catch(() => undefined);
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

app.on("window-all-closed", () => app.quit());
