import { harmonyAnalysisDocumentSchema, type HarmonyAnalysisDocument } from "./schemas";

export type HarmonyAnalysisSaveResult =
  | { status: "saved"; document: HarmonyAnalysisDocument }
  | { status: "conflict"; current: HarmonyAnalysisDocument | null };

export interface HarmonyAnalysisRepository {
  read(libraryScoreId: string): Promise<HarmonyAnalysisDocument | null>;
  save(input: {
    document: HarmonyAnalysisDocument;
    expectedDocumentVersion: number | null;
  }): Promise<HarmonyAnalysisSaveResult>;
  delete(libraryScoreId: string): Promise<void>;
}

export class InMemoryHarmonyAnalysisRepository implements HarmonyAnalysisRepository {
  private readonly documents = new Map<string, HarmonyAnalysisDocument>();
  constructor(private readonly scoreHashes: ReadonlyMap<string, string>) {}
  async read(libraryScoreId: string): Promise<HarmonyAnalysisDocument | null> {
    return this.documents.get(libraryScoreId) ?? null;
  }
  async save(input: {
    document: HarmonyAnalysisDocument;
    expectedDocumentVersion: number | null;
  }): Promise<HarmonyAnalysisSaveResult> {
    const document = harmonyAnalysisDocumentSchema.parse(input.document);
    if (this.scoreHashes.get(document.libraryScoreId) !== document.sourceContentHash)
      throw new Error("Score identity does not match analysis document");
    const current = this.documents.get(document.libraryScoreId) ?? null;
    if ((current?.documentVersion ?? null) !== input.expectedDocumentVersion) return { status: "conflict", current };
    const saved = { ...document, documentVersion: (current?.documentVersion ?? -1) + 1 };
    this.documents.set(saved.libraryScoreId, saved);
    return { status: "saved", document: saved };
  }
  async delete(libraryScoreId: string): Promise<void> {
    this.documents.delete(libraryScoreId);
  }
}
