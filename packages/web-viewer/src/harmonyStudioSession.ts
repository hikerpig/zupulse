import type {
  AnnotationTarget,
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  HarmonyCorrection,
} from "@zupulse/web-core";

export type HarmonyStudioSessionState = {
  status: "ready" | "unsaved" | "analyzing" | "saving" | "error" | "conflict";
  document: HarmonyAnalysisDocument | null;
  errorCode?: "version-conflict" | "analysis-failed" | "save-failed";
};

export class HarmonyStudioSession {
  private state: HarmonyStudioSessionState = { status: "analyzing", document: null };
  private intent = 0;
  private undoStack: HarmonyAnalysisDocument[] = [];
  private redoStack: HarmonyAnalysisDocument[] = [];
  private saveQueue = Promise.resolve();
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private analysisAbortController: AbortController | undefined;
  constructor(
    private readonly repository: HarmonyAnalysisRepository,
    private readonly libraryScoreId: string,
    private readonly autosaveDelayMs = 500,
    private readonly onStateChange?: (state: HarmonyStudioSessionState) => void,
  ) {}
  getState(): HarmonyStudioSessionState {
    return this.state;
  }
  async load(
    analyze: (input: { signal: AbortSignal }) => Promise<HarmonyAnalysisDocument>,
  ): Promise<HarmonyStudioSessionState> {
    let controller: AbortController | undefined;
    try {
      const existing = await this.repository.read(this.libraryScoreId);
      if (existing) return this.set({ status: "ready", document: existing });
      controller = this.beginAnalysis();
      const generated = await analyze({ signal: controller.signal });
      this.finishAnalysis(controller);
      const saved = await this.repository.save({ document: generated, expectedDocumentVersion: null });
      if (saved.status === "conflict")
        return this.set({ status: "error", document: null, errorCode: "version-conflict" });
      return this.set({ status: "ready", document: saved.document });
    } catch (error) {
      if (controller) this.finishAnalysis(controller);
      return this.set({ status: "error", document: null, errorCode: "analysis-failed" });
    }
  }
  async save(document: HarmonyAnalysisDocument): Promise<HarmonyStudioSessionState> {
    return this.enqueueSave(document);
  }
  async flush(): Promise<HarmonyStudioSessionState> {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    const document = this.state.document;
    return document === null ? this.state : this.enqueueSave(document);
  }
  setCorrections(corrections: readonly HarmonyCorrection[]): HarmonyStudioSessionState {
    return this.edit((document) => ({
      ...document,
      corrections: [...corrections],
      updatedAt: new Date().toISOString(),
    }));
  }
  setAnnotationTarget(annotationTarget: AnnotationTarget): HarmonyStudioSessionState {
    return this.edit((document) => ({ ...document, annotationTarget, updatedAt: new Date().toISOString() }));
  }
  async setScope(
    includedTrackIds: readonly string[],
    analyze: (input: { scope: readonly string[]; signal: AbortSignal }) => Promise<HarmonyAnalysisDocument>,
  ): Promise<HarmonyStudioSessionState> {
    this.edit((document) => ({
      ...document,
      activeRevision: {
        ...document.activeRevision,
        parameters: { ...document.activeRevision.parameters, scope: { includedTrackIds: [...includedTrackIds] } },
      },
      updatedAt: new Date().toISOString(),
    }));
    return this.reanalyze(analyze);
  }
  undo(): HarmonyStudioSessionState {
    const previous = this.undoStack.pop();
    const current = this.state.document;
    if (!previous || !current) return this.state;
    this.redoStack.push(current);
    return this.set({ status: "unsaved", document: previous });
  }
  redo(): HarmonyStudioSessionState {
    const next = this.redoStack.pop();
    const current = this.state.document;
    if (!next || !current) return this.state;
    this.undoStack.push(current);
    return this.set({ status: "unsaved", document: next });
  }
  async reanalyze(
    analyze: (input: { scope: readonly string[]; signal: AbortSignal }) => Promise<HarmonyAnalysisDocument>,
  ): Promise<HarmonyStudioSessionState> {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    const intent = ++this.intent;
    this.set({ status: "analyzing", document: this.state.document });
    const controller = this.beginAnalysis();
    try {
      const scope = this.state.document?.activeRevision.parameters.scope.includedTrackIds ?? [];
      const generated = await analyze({ scope, signal: controller.signal });
      this.finishAnalysis(controller);
      if (intent !== this.intent) return this.state;
      const current = this.state.document;
      const next =
        current === null
          ? generated
          : {
              ...generated,
              documentVersion: current.documentVersion,
              activeRevision: {
                ...generated.activeRevision,
                parameters: { ...generated.activeRevision.parameters, scope: current.activeRevision.parameters.scope },
              },
              corrections: current.corrections,
              annotationTarget: current.annotationTarget,
              updatedAt: generated.updatedAt,
            };
      const currentVersion = current?.documentVersion ?? null;
      const saved = await this.repository.save({ document: next, expectedDocumentVersion: currentVersion });
      if (intent !== this.intent) return this.state;
      if (saved.status === "conflict")
        return this.set({ status: "conflict", document: this.state.document, errorCode: "version-conflict" });
      return this.set({ status: "ready", document: saved.document });
    } catch (error) {
      this.finishAnalysis(controller);
      if (intent !== this.intent) return this.state;
      return this.set({
        status: "error",
        document: this.state.document,
        errorCode: "analysis-failed",
      });
    }
  }
  cancelReanalysis(): HarmonyStudioSessionState {
    this.intent += 1;
    this.analysisAbortController?.abort();
    this.analysisAbortController = undefined;
    return this.set({ status: this.state.document === null ? "error" : "ready", document: this.state.document });
  }
  dispose(): void {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    this.undoStack = [];
    this.redoStack = [];
    this.intent += 1;
    this.analysisAbortController?.abort();
    this.analysisAbortController = undefined;
  }
  private beginAnalysis(): AbortController {
    this.analysisAbortController?.abort();
    const controller = new AbortController();
    this.analysisAbortController = controller;
    return controller;
  }
  private finishAnalysis(controller: AbortController): void {
    if (this.analysisAbortController === controller) this.analysisAbortController = undefined;
  }
  private edit(transform: (document: HarmonyAnalysisDocument) => HarmonyAnalysisDocument): HarmonyStudioSessionState {
    const current = this.state.document;
    if (current === null) return this.state;
    this.undoStack.push(current);
    this.redoStack = [];
    const state = this.set({ status: "unsaved", document: transform(current) });
    this.scheduleAutosave();
    return state;
  }
  private scheduleAutosave(): void {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = undefined;
      void this.flush();
    }, this.autosaveDelayMs);
  }
  private async enqueueSave(document: HarmonyAnalysisDocument): Promise<HarmonyStudioSessionState> {
    const run = async () => {
      this.set({ status: "saving", document });
      try {
        const saved = await this.repository.save({ document, expectedDocumentVersion: document.documentVersion });
        if (saved.status === "conflict")
          return this.set({ status: "conflict", document, errorCode: "version-conflict" });
        return this.set({ status: "ready", document: saved.document });
      } catch (error) {
        return this.set({ status: "error", document, errorCode: "save-failed" });
      }
    };
    const next = this.saveQueue.then(run, run);
    this.saveQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  private set(state: HarmonyStudioSessionState): HarmonyStudioSessionState {
    this.state = state;
    this.onStateChange?.(state);
    return state;
  }
}
