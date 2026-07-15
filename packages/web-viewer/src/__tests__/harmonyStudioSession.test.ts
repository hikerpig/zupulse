import { describe, expect, it } from "vitest";
import { InMemoryHarmonyAnalysisRepository, type HarmonyAnalysisDocument } from "@zupulse/web-core";
import { HarmonyStudioSession } from "../harmonyStudioSession";

const document: HarmonyAnalysisDocument = {
  schemaVersion: "1.0.0",
  libraryScoreId: "00000000-0000-4000-8000-000000000001",
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
};

describe("HarmonyStudioSession", () => {
  it("does not silently reanalyze an existing document", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    let calls = 0;
    await session.load(async () => {
      calls += 1;
      return document;
    });
    expect(calls).toBe(0);
    expect(session.getState().status).toBe("ready");
  });
});
