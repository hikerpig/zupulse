import { describe, expect, it } from "vitest";
import {
  InMemoryHarmonyAnalysisRepository,
  type HarmonyAnalysisDocument,
  type HarmonyAnalysisRepository,
} from "@zupulse/web-core";
import { exportHarmonyStudioDocument } from "../harmonyStudioExport";
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
    parameters: { scope: { includedTrackIds: ["P1"] }, topK: 8, decisionThreshold: 0.6 },
    segments: [],
  },
  corrections: [],
  annotationTarget: { trackId: "P1", staffIndex: 0 },
  updatedAt: "2026-07-15T00:00:00.000Z",
};
const score = new TextEncoder().encode(
  `<score-partwise><part id="P1"><measure number="1"><note/></measure></part></score-partwise>`,
);

describe("Studio harmony export", () => {
  it("exports a chord-suffixed copy without modifying the source bytes", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    let saved: { fileName: string; bytes: Uint8Array } | undefined;
    await expect(
      exportHarmonyStudioDocument({
        session,
        projection: [
          {
            type: "chord",
            range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 0 } },
            chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
            origin: "analysis",
          },
        ],
        partId: "P1",
        readScore: async () => ({ fileName: "song.musicxml", bytes: score }),
        gateway: {
          selectForImport: async () => [],
          saveExport: async (file) => {
            saved = file;
            return "saved";
          },
        },
      }),
    ).resolves.toBe("saved");
    expect(saved?.fileName).toBe("song-chords.musicxml");
    expect(new TextDecoder().decode(saved?.bytes)).toContain("<harmony>");
    expect(new TextDecoder().decode(score)).not.toContain("<harmony>");
  });

  it("does not start export while the Studio document has a CAS conflict", async () => {
    let saves = 0;
    const repository: HarmonyAnalysisRepository = {
      read: async () => document,
      save: async () => (++saves === 1 ? { status: "saved", document } : { status: "conflict", current: document }),
      delete: async () => undefined,
    };
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    await session.save(document);
    await session.save(document);
    await expect(
      exportHarmonyStudioDocument({
        session,
        projection: [],
        partId: "P1",
        readScore: async () => {
          throw new Error("must not read");
        },
        gateway: { selectForImport: async () => [], saveExport: async () => "saved" },
      }),
    ).rejects.toThrow("STUDIO_DOCUMENT_NOT_SAVED");
  });
});
