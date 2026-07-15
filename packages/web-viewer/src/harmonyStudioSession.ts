import type { HarmonyAnalysisDocument, HarmonyAnalysisRepository } from "@zupulse/web-core";

export type HarmonyStudioSessionState = {
  status: "ready" | "analyzing" | "saving" | "error" | "conflict";
  document: HarmonyAnalysisDocument | null;
  error?: string;
};

export class HarmonyStudioSession {
  private state: HarmonyStudioSessionState = { status: "analyzing", document: null };
  private intent = 0;
  constructor(
    private readonly repository: HarmonyAnalysisRepository,
    private readonly libraryScoreId: string,
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
    this.set({ status: "saving", document });
    try {
      const saved = await this.repository.save({ document, expectedDocumentVersion: document.documentVersion });
      if (saved.status === "conflict") return this.set({ status: "conflict", document, error: "分析文档版本冲突" });
      return this.set({ status: "ready", document: saved.document });
    } catch (error) {
      return this.set({ status: "error", document, error: error instanceof Error ? error.message : "保存失败" });
    }
  }
  async reanalyze(analyze: () => Promise<HarmonyAnalysisDocument>): Promise<HarmonyStudioSessionState> {
    const intent = ++this.intent;
    this.set({ status: "analyzing", document: this.state.document });
    try {
      const generated = await analyze();
      if (intent !== this.intent) return this.state;
      const currentVersion = this.state.document?.documentVersion ?? null;
      const saved = await this.repository.save({ document: generated, expectedDocumentVersion: currentVersion });
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
  cancelReanalysis(): void {
    this.intent += 1;
  }
  private set(state: HarmonyStudioSessionState): HarmonyStudioSessionState {
    this.state = state;
    return state;
  }
}
