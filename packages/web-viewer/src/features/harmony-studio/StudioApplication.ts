import {
  analyzeHarmony,
  applyCorrectionCommand,
  BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
  compareMoments,
  effectiveHarmonyProjection,
  insertCorrection,
  listMusicXmlPartIds,
  parseSourceHarmonyEvents,
  projectAlphaTabHarmonyInput,
  projectSourceHarmonyEvents,
  readMusicXmlRootXml,
} from "@zupulse/web-core";
import type {
  AnnotationTarget,
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  HarmonyCorrection,
  LibraryScore,
  PreviewTransportState,
  ScoreFileGateway,
  ScoreFormatAdapter,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import type { ViewerFile } from "../../host";
import { HarmonyStudioSession } from "../../harmonyStudioSession";
import type { HarmonyStudioSessionState } from "../../harmonyStudioSession";
import {
  createHarmonyAnalysisWorkerRunner,
  HarmonyAnalysisCancelledError,
  type HarmonyAnalysisRunner,
} from "../../harmony-analysis-worker-client";
import { exportHarmonyStudioDocument } from "../../harmonyStudioExport";
import type { StudioScoreRuntime, StudioScoreRuntimeSnapshot } from "../../studio-score-runtime";
import { ApplicationFailure, applicationIssue, type ApplicationIssue } from "../../app/applicationIssue";
import {
  restoreHarmonySelection,
  selectContainingHarmonyRange,
  type HarmonyRangeViewItem,
  type HarmonySelection,
} from "./harmony-range-view-model";
import { projectStudioRanges, type StudioHarmonySource } from "./model/studio-ranges";

export function createDefaultHarmonyAnalysisRunner(): HarmonyAnalysisRunner {
  if (typeof Worker !== "undefined") return createHarmonyAnalysisWorkerRunner();
  return {
    async analyze(input, options, signal) {
      if (signal?.aborted) throw new HarmonyAnalysisCancelledError();
      return analyzeHarmony(input, options);
    },
  };
}

export type StudioApplicationSnapshot = {
  libraryScoreId: string;
  status: "loading" | "analyzing" | "ready" | "unsaved" | "saving" | "error" | "conflict";
  availableTrackIds?: readonly string[];
  document?: HarmonyAnalysisDocument;
  ranges?: readonly HarmonyRangeViewItem[];
  selection?: HarmonySelection;
  selectionNotice?: "no-effective-range";
  transport?: PreviewTransportState;
  audioStatus?: StudioScoreRuntimeSnapshot["audio"];
  previewError?: ApplicationIssue;
  audioError?: ApplicationIssue;
  error?: ApplicationIssue;
};

export type StudioApplicationDependencies = {
  library: {
    repository: SheetLibraryRepository;
    gateway: ScoreFileGateway;
    adapters: readonly ScoreFormatAdapter[];
  };
  openStudioRuntime?(file: ViewerFile): Promise<StudioScoreRuntime>;
  harmonyAnalysisRunner?: HarmonyAnalysisRunner;
  reportDiagnostic?(error: unknown, operation: string): void;
};

/**
 * Studio workspace deep module. Owns the Harmony Studio session registry, the
 * preview runtime, the analysis document, and the projection of ranges and
 * selection. React only subscribes to `getSnapshot` and sends commands; the
 * host (ViewerApplication, later a WorkspaceCoordinator) arbitrates the shared
 * alphaTab surface via the `acquireWorkspace` hook on `open`.
 */
export class StudioApplication {
  private studioRuntime: StudioScoreRuntime | undefined;
  private studioRuntimeLibraryScoreId: string | undefined;
  private studioPreviewEnabled = true;
  private studioSelectionDetach: (() => void) | undefined;
  private studioErrorDetach: (() => void) | undefined;
  private studioTransportDetach: (() => void) | undefined;
  private studioAudioDetach: (() => void) | undefined;
  private chain = Promise.resolve();
  private destroyPromise?: Promise<void>;
  private studioIntent = 0;
  private studioOpening: { id: string; promise: Promise<void> } | undefined;
  private readonly studioSessions = new Map<string, HarmonyStudioSession>();
  private readonly studioAvailableTrackIds = new Map<string, string[]>();
  private readonly studioSources = new Map<string, StudioHarmonySource>();
  private snapshot: StudioApplicationSnapshot | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly harmonyAnalysisRunner: HarmonyAnalysisRunner;

  constructor(private readonly dependencies: StudioApplicationDependencies) {
    this.harmonyAnalysisRunner = dependencies.harmonyAnalysisRunner ?? createDefaultHarmonyAnalysisRunner();
  }

  getSnapshot = (): StudioApplicationSnapshot | undefined => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hasHarmonyAnalysisStorage(): boolean {
    return this.getHarmonyAnalysisRepository() !== undefined;
  }

  getCurrentStudioSession(): StudioScoreRuntime | undefined {
    return this.studioRuntime;
  }

  async open(id: string, acquireWorkspace?: () => Promise<void>): Promise<void> {
    if (this.studioOpening?.id === id) return this.studioOpening.promise;
    const operation = this.chain.then(() => this.openOnce(id, acquireWorkspace));
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    const promise = operation.finally(() => {
      if (this.studioOpening?.promise === promise) this.studioOpening = undefined;
    });
    this.studioOpening = { id, promise };
    return promise;
  }

  async setCorrection(id: string, range: HarmonyCorrection["range"], value: HarmonyCorrection["value"]): Promise<void> {
    const current = this.snapshot;
    const session = this.studioSessions.get(id);
    if (!session || current?.libraryScoreId !== id || !current.document) return;
    const updatedAt = new Date().toISOString();
    const document: HarmonyAnalysisDocument = {
      ...current.document,
      corrections: insertCorrection(current.document.corrections, {
        id: crypto.randomUUID(),
        range,
        value,
        updatedAt,
      }),
      updatedAt,
    };
    session.setCorrections(document.corrections);
    await session.flush();
  }

  selectRange(id: string, range: HarmonyCorrection["range"]): void {
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== id) return;
    this.studioRuntime?.highlight(range);
    this.setStudio(id, { ...studio, selection: { focus: range.start, range } });
  }

  togglePreview(id: string): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.togglePlayback();
    this.syncTransport(id);
    this.setAudioError(id, result?.status);
  }

  setPreviewPosition(id: string, positionTicks: number): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setPosition(positionTicks);
    this.syncTransport(id);
    this.setAudioError(id, result?.status);
  }

  setPreviewSpeed(id: string, speed: number): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setSpeed(speed);
    this.syncTransport(id);
    this.setAudioError(id, result?.status);
  }

  setPreviewLoop(id: string, range: HarmonyCorrection["range"] | undefined): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setLoop(range);
    this.syncTransport(id);
    this.setAudioError(id, result?.status);
  }

  retryPreview(id: string): void {
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== id || !studio.ranges || this.studioRuntimeLibraryScoreId !== id) return;
    const previewError = this.applyPreview(id, studio.ranges);
    if (previewError) {
      this.setStudio(id, { ...studio, previewError });
      return;
    }
    const { previewError: _previewError, ...nextStudio } = studio;
    this.setStudio(id, nextStudio);
  }

  setPreviewEnabled(id: string, enabled: boolean): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    this.studioPreviewEnabled = enabled;
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== id || !studio.ranges) return;
    const previewError = this.applyPreview(id, studio.ranges);
    const { previewError: _previousPreviewError, ...nextStudio } = studio;
    this.setStudio(id, {
      ...nextStudio,
      ...(previewError === undefined ? {} : { previewError }),
    });
  }

  async setAnnotationTarget(id: string, annotationTarget: AnnotationTarget): Promise<void> {
    const session = this.studioSessions.get(id);
    if (!session) return;
    session.setAnnotationTarget(annotationTarget);
    await session.flush();
  }

  async resetCorrection(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document) return;
    session.setCorrections(applyCorrectionCommand(document.corrections, { type: "reset", range }));
    await session.flush();
  }

  async splitCorrection(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document || range.start.measureIndex !== range.end.measureIndex) return;
    const correction = document.corrections.find(
      (item) => compareMoments(item.range.start, range.start) <= 0 && compareMoments(range.end, item.range.end) <= 0,
    );
    if (!correction) return;
    const distance = range.end.offsetTicks - range.start.offsetTicks;
    if (distance < 2) return;
    const at = {
      measureIndex: range.start.measureIndex,
      offsetTicks: range.start.offsetTicks + Math.floor(distance / 2),
    };
    session.setCorrections(applyCorrectionCommand(document.corrections, { type: "split", id: correction.id, at }));
    await session.flush();
  }

  async mergeCorrections(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document) return;
    const ordered = [...document.corrections].sort((left, right) =>
      compareMoments(left.range.start, right.range.start),
    );
    const pairIndex = ordered.findIndex((left, index) => {
      const right = ordered[index + 1];
      return (
        right !== undefined &&
        compareMoments(left.range.start, range.start) <= 0 &&
        compareMoments(range.end, right.range.end) <= 0 &&
        compareMoments(left.range.end, right.range.start) === 0
      );
    });
    const left = pairIndex < 0 ? undefined : ordered[pairIndex];
    const right = pairIndex < 0 ? undefined : ordered[pairIndex + 1];
    if (!left || !right) return;
    session.setCorrections(
      applyCorrectionCommand(document.corrections, { type: "merge", leftId: left.id, rightId: right.id }),
    );
    await session.flush();
  }

  async moveCorrection(id: string, range: HarmonyCorrection["range"], deltaTicks: number): Promise<void> {
    if (!Number.isInteger(deltaTicks) || deltaTicks === 0) return;
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document || range.start.measureIndex !== range.end.measureIndex) return;
    const correction = document.corrections.find(
      (item) => compareMoments(item.range.start, range.start) <= 0 && compareMoments(range.end, item.range.end) <= 0,
    );
    if (!correction || correction.range.start.measureIndex !== correction.range.end.measureIndex) return;
    const start = correction.range.start.offsetTicks + deltaTicks;
    const end = correction.range.end.offsetTicks + deltaTicks;
    if (start < 0 || end <= start) return;
    session.setCorrections(
      applyCorrectionCommand(document.corrections, {
        type: "move",
        id: correction.id,
        start: { measureIndex: correction.range.start.measureIndex, offsetTicks: start },
        end: { measureIndex: correction.range.end.measureIndex, offsetTicks: end },
      }),
    );
    await session.flush();
  }

  async setScope(id: string, includedTrackIds: readonly string[]): Promise<void> {
    if (includedTrackIds.length === 0) throw new Error("STUDIO_SCOPE_EMPTY");
    const session = this.studioSessions.get(id);
    if (!session) return;
    const state = await session.setScope(includedTrackIds, ({ scope, signal }) =>
      this.createStudioDocument(id, scope, signal),
    );
    this.setStudioState(id, state);
  }

  async reanalyze(id: string): Promise<void> {
    const session = this.studioSessions.get(id);
    if (!session) return;
    const state = await session.reanalyze(({ scope, signal }) => this.createStudioDocument(id, scope, signal));
    this.setStudioState(id, state);
  }

  cancelReanalysis(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.cancelReanalysis());
  }

  async flush(id: string): Promise<void> {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, await session.flush());
  }

  undo(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.undo());
  }

  redo(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.redo());
  }

  async export(id: string): Promise<"saved" | "cancelled"> {
    const library = this.dependencies.library;
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document) throw new Error("STUDIO_DOCUMENT_NOT_SAVED");
    const source = await library.repository.readScore(id as LibraryScore["id"]);
    const trackIndex = trackIndexFromId(document.annotationTarget.trackId);
    const partId = listMusicXmlPartIds(source.bytes)[trackIndex];
    if (partId === undefined) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
    const scoreEnd = document.activeRevision.segments.reduce(
      (end, segment) => (compareMoments(segment.range.end, end) > 0 ? segment.range.end : end),
      { measureIndex: 0, offsetTicks: 0 },
    );
    return exportHarmonyStudioDocument({
      session,
      projection: effectiveHarmonyProjection({
        revision: document.activeRevision.segments,
        source: projectSourceHarmonyEvents(
          parseSourceHarmonyEvents(readMusicXmlRootXml(source.bytes), partId),
          scoreEnd,
        ),
        corrections: document.corrections,
      }),
      partId,
      readScore: async () => source,
      gateway: library.gateway,
    });
  }

  /** Tears down the active preview runtime (called when a Viewer workspace takes over). */
  async releaseRuntime(): Promise<void> {
    const runtime = this.studioRuntime;
    this.studioDetachAll();
    this.studioRuntime = undefined;
    this.studioRuntimeLibraryScoreId = undefined;
    await runtime?.destroy();
  }

  /** Drops all state for a deleted library score. */
  async releaseScore(id: string): Promise<void> {
    this.studioSessions.get(id)?.dispose();
    this.studioSessions.delete(id);
    this.studioAvailableTrackIds.delete(id);
    this.studioSources.delete(id);
    if (this.snapshot?.libraryScoreId === id) this.setSnapshot(undefined);
    if (this.studioRuntimeLibraryScoreId === id) await this.releaseRuntime();
  }

  destroy(): Promise<void> {
    this.destroyPromise ??= this.destroyOnce();
    return this.destroyPromise;
  }

  private getHarmonyAnalysisRepository(): HarmonyAnalysisRepository | undefined {
    const repository = this.dependencies.library.repository as Partial<HarmonyAnalysisRepository> | undefined;
    return typeof repository?.read === "function" &&
      typeof repository.save === "function" &&
      typeof repository.delete === "function"
      ? (repository as HarmonyAnalysisRepository)
      : undefined;
  }

  private async openOnce(id: string, acquireWorkspace?: () => Promise<void>): Promise<void> {
    const library = this.dependencies.library;
    const repository = this.getHarmonyAnalysisRepository();
    const intent = ++this.studioIntent;
    if (!repository) {
      this.setStudio(id, { status: "error", error: applicationIssue("studio-storage-unavailable", false) });
      return;
    }
    this.setStudio(id, { status: "loading" });
    try {
      const score = await library.repository.get(id as LibraryScore["id"]);
      if (!score) throw new ApplicationFailure(applicationIssue("score-not-found", false));
      if (score.format !== "musicxml")
        throw new ApplicationFailure(applicationIssue("studio-format-unsupported", false));
      const source = await library.repository.readScore(id as LibraryScore["id"]);
      this.studioSources.set(id, {
        rootXml: readMusicXmlRootXml(source.bytes),
        partIds: listMusicXmlPartIds(source.bytes),
      });
      const previousStudio = this.studioRuntime;
      this.studioDetachAll();
      this.studioRuntime = undefined;
      this.studioRuntimeLibraryScoreId = undefined;
      await acquireWorkspace?.();
      await previousStudio?.destroy();
      if (!this.dependencies.openStudioRuntime)
        throw new ApplicationFailure(applicationIssue("studio-runtime-unavailable", false));
      this.studioRuntime = await this.dependencies.openStudioRuntime(source);
      this.studioRuntimeLibraryScoreId = id;
      this.studioSelectionDetach = this.studioRuntime.subscribeSelection((moment) => this.selectMoment(id, moment));
      this.studioErrorDetach = this.studioRuntime.subscribeErrors((error) => {
        this.reportDiagnostic(error, "studio.preview");
        const studio = this.snapshot;
        if (studio?.libraryScoreId === id)
          this.setStudio(id, { ...studio, previewError: applicationIssue("studio-preview-failed") });
      });
      this.studioTransportDetach = this.studioRuntime.subscribeTransport(() => this.syncTransport(id));
      this.studioAudioDetach = this.studioRuntime.subscribeAudio?.(() => this.syncTransport(id));
      this.studioAvailableTrackIds.set(
        id,
        listMusicXmlPartIds(source.bytes).map((_, index) => `track-${index + 1}`),
      );
      const session = this.getStudioSession(id, repository);
      const state = await session.load(({ signal }) => this.createStudioDocument(id, undefined, signal));
      if (intent === this.studioIntent) this.setStudioState(id, state);
    } catch (error) {
      this.reportDiagnostic(error, "studio.open");
      if (intent === this.studioIntent) {
        this.setStudio(id, {
          status: "error",
          error: error instanceof ApplicationFailure ? error.issue : applicationIssue("studio-analysis-failed"),
        });
      }
    }
  }

  private getStudioSession(id: string, repository: HarmonyAnalysisRepository): HarmonyStudioSession {
    const existing = this.studioSessions.get(id);
    if (existing) return existing;
    const session = new HarmonyStudioSession(repository, id, 500, (state) => this.setStudioState(id, state));
    this.studioSessions.set(id, session);
    return session;
  }

  private async createStudioDocument(
    id: string,
    requestedScope?: readonly string[],
    signal?: AbortSignal,
  ): Promise<HarmonyAnalysisDocument> {
    const library = this.dependencies.library;
    const score = await library.repository.get(id as LibraryScore["id"]);
    if (!score) throw new ApplicationFailure(applicationIssue("score-not-found", false));
    if (score.format !== "musicxml") throw new ApplicationFailure(applicationIssue("studio-format-unsupported", false));
    const file = await library.repository.readScore(id as LibraryScore["id"]);
    const adapter = library.adapters.find((candidate) => candidate.format === "musicxml");
    if (!adapter) throw new ApplicationFailure(applicationIssue("studio-analyzer-unavailable", false));
    const parsed = await adapter.parse({ fileName: file.fileName, bytes: file.bytes });
    const allTrackIds = parsed.document.tracks.map((track) => track.id);
    const includedTrackIds = requestedScope === undefined ? allTrackIds : [...requestedScope];
    if (includedTrackIds.length === 0)
      throw new ApplicationFailure(applicationIssue("studio-no-analyzable-tracks", false));
    if (includedTrackIds.some((trackId) => !allTrackIds.includes(trackId)))
      throw new Error("STUDIO_SCOPE_TRACK_NOT_FOUND");
    const analysisInput = projectAlphaTabHarmonyInput(
      parsed.runtime as Parameters<typeof projectAlphaTabHarmonyInput>[0],
    );
    const segments = await this.harmonyAnalysisRunner.analyze(
      analysisInput,
      {
        includedTrackIds,
        topK: 8,
        decisionThreshold: 0.6,
      },
      signal,
    );
    const now = new Date().toISOString();
    return {
      schemaVersion: "1.0.0",
      libraryScoreId: id,
      sourceContentHash: score.scoreIdentity,
      documentVersion: 0,
      activeRevision: {
        id: crypto.randomUUID(),
        algorithmVersion: BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
        createdAt: now,
        parameters: {
          scope: { includedTrackIds },
          topK: 8,
          decisionThreshold: 0.6,
        },
        segments,
      },
      corrections: [],
      annotationTarget: { trackId: includedTrackIds[0]!, staffIndex: 0 },
      updatedAt: now,
    };
  }

  private selectMoment(id: string, moment: { measureIndex: number; offsetTicks: number }): void {
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== id || !studio.ranges) return;
    const selection = selectContainingHarmonyRange(studio.ranges, moment);
    if (selection) {
      const { selectionNotice: _selectionNotice, ...nextStudio } = studio;
      this.setStudio(id, { ...nextStudio, selection });
      return;
    }
    const { selection: _selection, ...clearedStudio } = studio;
    this.setStudio(id, {
      ...clearedStudio,
      selectionNotice: "no-effective-range",
    });
  }

  private reportDiagnostic(error: unknown, operation: string): void {
    this.dependencies.reportDiagnostic?.(error, operation);
  }

  private setSnapshot(snapshot: StudioApplicationSnapshot | undefined): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private setStudio(libraryScoreId: string, studio: Omit<StudioApplicationSnapshot, "libraryScoreId">): void {
    this.setSnapshot({ libraryScoreId, ...studio });
  }

  private setStudioState(libraryScoreId: string, state: HarmonyStudioSessionState): void {
    const ranges = state.document === null ? undefined : this.getStudioRanges(libraryScoreId, state.document);
    const previousSelection = this.snapshot?.libraryScoreId === libraryScoreId ? this.snapshot.selection : undefined;
    const selection =
      ranges === undefined
        ? undefined
        : previousSelection === undefined
          ? ranges[0] === undefined
            ? undefined
            : { focus: ranges[0].effective.range.start, range: ranges[0].effective.range }
          : restoreHarmonySelection(ranges, previousSelection.focus);
    const previewError = ranges === undefined ? undefined : this.applyPreview(libraryScoreId, ranges);
    this.setStudio(libraryScoreId, {
      status: state.status,
      ...(this.studioAvailableTrackIds.has(libraryScoreId)
        ? { availableTrackIds: this.studioAvailableTrackIds.get(libraryScoreId)! }
        : {}),
      ...(state.document === null ? {} : { document: state.document }),
      ...(ranges === undefined ? {} : { ranges }),
      ...(selection === undefined ? {} : { selection }),
      ...(this.studioRuntimeLibraryScoreId === libraryScoreId && this.studioRuntime
        ? {
            transport: this.studioRuntime.getSnapshot().transport,
            audioStatus: this.studioRuntime.getSnapshot().audio,
          }
        : {}),
      ...(state.errorCode === undefined
        ? {}
        : {
            error:
              state.status === "conflict"
                ? applicationIssue("studio-version-conflict")
                : applicationIssue("studio-save-failed"),
          }),
      ...(previewError === undefined ? {} : { previewError }),
    });
  }

  private applyPreview(libraryScoreId: string, ranges: readonly HarmonyRangeViewItem[]): ApplicationIssue | undefined {
    if (this.studioRuntimeLibraryScoreId !== libraryScoreId) return undefined;
    try {
      const result = this.studioRuntime?.applyPreview(
        this.studioPreviewEnabled ? ranges.map((item) => item.effective) : [],
      );
      return result?.status === "applied" ? undefined : applicationIssue("studio-preview-unavailable");
    } catch (error) {
      this.reportDiagnostic(error, "studio.preview");
      return applicationIssue("studio-preview-failed");
    }
  }

  private syncTransport(libraryScoreId: string): void {
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== libraryScoreId || this.studioRuntimeLibraryScoreId !== libraryScoreId) return;
    const runtimeSnapshot = this.studioRuntime?.getSnapshot();
    if (runtimeSnapshot)
      this.setStudio(libraryScoreId, {
        ...studio,
        transport: runtimeSnapshot.transport,
        audioStatus: runtimeSnapshot.audio,
      });
  }

  private setAudioError(libraryScoreId: string, status: string | undefined): void {
    const studio = this.snapshot;
    if (studio?.libraryScoreId !== libraryScoreId) return;
    if (status === "unavailable" || status === "unrepresentable") {
      this.setStudio(libraryScoreId, {
        ...studio,
        audioError: applicationIssue("studio-audio-unavailable"),
      });
      return;
    }
    if (studio.audioError !== undefined) {
      const { audioError: _audioError, ...nextStudio } = studio;
      this.setStudio(libraryScoreId, nextStudio);
    }
  }

  private getStudioRanges(libraryScoreId: string, document: HarmonyAnalysisDocument): HarmonyRangeViewItem[] {
    return projectStudioRanges(this.studioSources.get(libraryScoreId), document);
  }

  private studioDetachAll(): void {
    this.studioSelectionDetach?.();
    this.studioSelectionDetach = undefined;
    this.studioErrorDetach?.();
    this.studioErrorDetach = undefined;
    this.studioTransportDetach?.();
    this.studioTransportDetach = undefined;
    this.studioAudioDetach?.();
    this.studioAudioDetach = undefined;
  }

  private async destroyOnce(): Promise<void> {
    this.studioDetachAll();
    for (const studioSession of this.studioSessions.values()) studioSession.dispose();
    this.studioSessions.clear();
    await this.chain;
    const studioRuntime = this.studioRuntime;
    this.studioRuntime = undefined;
    this.studioRuntimeLibraryScoreId = undefined;
    this.setSnapshot(undefined);
    await studioRuntime?.destroy();
  }
}

function trackIndexFromId(trackId: string): number {
  const match = /^track-(\d+)$/.exec(trackId);
  if (!match || Number(match[1]) < 1) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
  return Number(match[1]) - 1;
}
