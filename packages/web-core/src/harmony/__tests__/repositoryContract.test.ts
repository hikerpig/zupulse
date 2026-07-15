import { describe, expect, it } from "vitest";
import { InMemoryHarmonyAnalysisRepository } from "../repository";
import type { HarmonyAnalysisDocument } from "../schemas";

const scoreId = "00000000-0000-4000-8000-000000000001";
const document = (): HarmonyAnalysisDocument => ({
  schemaVersion: "1.0.0",
  libraryScoreId: scoreId,
  sourceContentHash: "a".repeat(64),
  documentVersion: 0,
  activeRevision: {
    id: "00000000-0000-4000-8000-000000000002",
    algorithmVersion: "rules-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    parameters: { scope: { includedTrackIds: ["piano"] }, topK: 8, decisionThreshold: 0.6 },
    segments: [],
  },
  corrections: [],
  annotationTarget: { trackId: "piano", staffIndex: 0 },
  updatedAt: "2026-07-15T00:00:00.000Z",
});

describe("HarmonyAnalysisRepository contract", () => {
  it("supports create/read and compare-and-swap", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(new Map([[scoreId, "a".repeat(64)]]));
    expect(await repository.read(scoreId)).toBeNull();
    const saved = await repository.save({ document: document(), expectedDocumentVersion: null });
    expect(saved.status).toBe("saved");
    expect(saved.status === "saved" && saved.document.documentVersion).toBe(0);
    const conflict = await repository.save({ document: document(), expectedDocumentVersion: null });
    expect(conflict).toMatchObject({ status: "conflict" });
  });

  it("rejects hash mismatch and cannot recreate after score deletion", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(new Map([[scoreId, "b".repeat(64)]]));
    await expect(repository.save({ document: document(), expectedDocumentVersion: null })).rejects.toThrow("identity");
    await repository.delete(scoreId);
    expect(await repository.read(scoreId)).toBeNull();
  });
});
