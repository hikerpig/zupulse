import type {
  AnnotationTarget,
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  HarmonyCorrection,
} from "@zupulse/web-core";

export type HarmonyStudioSessionState = {
  status: "ready" | "unsaved" | "analyzing" | "saving" | "error" | "conflict";
  document: HarmonyAnalysisDocument | null;
  error?: string;
};

export class HarmonyStudioSession {
  private state: HarmonyStudioSessionState = { status: "analyzing", document: null };
  private intent = 0;
  private undoStack: HarmonyAnalysisDocument[] = [];
  private redoStack: HarmonyAnalysisDocument[] = [];
  private saveQueue = Promise.resolve();
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly repository: HarmonyAnalysisRepository,
    private readonly libraryScoreId: string,
    private readonly autosaveDelayMs = 500,
    private readonly onStateChange?: (state: HarmonyStudioSessionState) => void,
  ) {}
  getState(): HarmonyStudioSessionState {
    return this.state;
  }
  async load(analyze: () => Promise<HarmonyAnalysisDocument>): Promise<HarmonyStudioSessionState> {
    try {
      const existing = await this.repository.read(this.libraryScoreId);
      if (existing) return this.set({ status: "ready", document: existing });
      const generated = await analyze();
      const saved = await this.repository.save({ document: generated, expectedDocumentVersion: null });
      if (saved.status === "conflict") return this.set({ status: "error", document: null, error: "分析文档版本冲突" });
      return this.set({ status: "ready", document: saved.document });
    } catch (error) {
      return this.set({ status: "error", document: null, error: error instanceof Error ? error.message : "分析失败" });
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
    analyze: (input: { scope: readonly string[] }) => Promise<HarmonyAnalysisDocument>,
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
    analyze: (input: { scope: readonly string[] }) => Promise<HarmonyAnalysisDocument>,
  ): Promise<HarmonyStudioSessionState> {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    const intent = ++this.intent;
    this.set({ status: "analyzing", document: this.state.document });
    try {
      const scope = this.state.document?.activeRevision.parameters.scope.includedTrackIds ?? [];
      const generated = await analyze({ scope });
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
        return this.set({ status: "conflict", document: this.state.document, error: "分析文档版本冲突" });
      return this.set({ status: "ready", document: saved.document });
    } catch (error) {
      if (intent !== this.intent) return this.state;
      return this.set({
        status: "error",
        document: this.state.document,
        error: error instanceof Error ? error.message : "分析失败",
      });
    }
  }
  cancelReanalysis(): HarmonyStudioSessionState {
    this.intent += 1;
    return this.set({ status: this.state.document === null ? "error" : "ready", document: this.state.document });
  }
  dispose(): void {
    if (this.autosaveTimer !== undefined) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    this.undoStack = [];
    this.redoStack = [];
    this.intent += 1;
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
        if (saved.status === "conflict") return this.set({ status: "conflict", document, error: "分析文档版本冲突" });
        return this.set({ status: "ready", document: saved.document });
      } catch (error) {
        return this.set({ status: "error", document, error: error instanceof Error ? error.message : "保存失败" });
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
