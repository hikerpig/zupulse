import type { HarmonyAnalysisDocument, HarmonyAnalysisRepository } from "@zupulse/web-core";

export type HarmonyStudioSessionState = {
  status: "ready" | "analyzing" | "error";
  document: HarmonyAnalysisDocument | null;
  error?: string;
};

export class HarmonyStudioSession {
  private state: HarmonyStudioSessionState = { status: "analyzing", document: null };
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
  private set(state: HarmonyStudioSessionState): HarmonyStudioSessionState {
    this.state = state;
    return state;
  }
}
