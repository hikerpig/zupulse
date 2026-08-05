import { describe, expect, it } from "vitest";
import { buildWritebackProposals } from "../fusion/build-writeback-proposals";
import type { MusicXmlSourceNote } from "../normalizers/audiveris";

describe("buildWritebackProposals", () => {
  it("makes a uniquely located pitch disagreement ready for reviewed writeback", () => {
    const result = buildWritebackProposals(
      scoreEvidence([{ id: "score-0", sourceNoteId: "source-0", playbackIteration: 0 }]),
      alignment([
        {
          id: "alignment-0",
          status: "ambiguous",
          scoreNoteId: "score-0",
          midiNoteId: "midi-0",
          scorePitch: 60,
          midiPitch: 61,
          confidence: 0.5,
          reason: "pitch-disagreement",
        },
      ]),
      [pitchProposal("proposal-0", "score-0", "midi-0", 61)],
      sourceNotes(),
    );

    expect(result).toEqual({
      schemaVersion: "2.0.0",
      mode: "report-only",
      proposals: [
        expect.objectContaining({
          id: "proposal-0",
          type: "pitch-disagreement",
          scoreNoteIds: ["score-0"],
          midiNoteIds: ["midi-0"],
          suggestedSoundingMidi: 61,
          autoApplicable: false,
          reviewability: { status: "writeback-ready", reasons: [] },
          target: expect.objectContaining({ partId: "P1", measureIndex: 0, noteIndex: 0 }),
          before: expect.objectContaining({ writtenPitch: { step: "C", alter: 0, octave: 4 } }),
        }),
      ],
    });
  });

  it("merges consistent repeat occurrences and rejects conflicting playback evidence", () => {
    const score = scoreEvidence([
      { id: "score-0", sourceNoteId: "source-0", playbackIteration: 0 },
      { id: "score-1", sourceNoteId: "source-0", playbackIteration: 1 },
    ]);
    const consistent = buildWritebackProposals(
      score,
      alignment([ambiguous("alignment-0", "score-0", "midi-0", 61), ambiguous("alignment-1", "score-1", "midi-1", 61)]),
      [pitchProposal("proposal-0", "score-0", "midi-0", 61), pitchProposal("proposal-1", "score-1", "midi-1", 61)],
      sourceNotes(),
    );
    const conflicting = buildWritebackProposals(
      score,
      alignment([ambiguous("alignment-0", "score-0", "midi-0", 61), ambiguous("alignment-1", "score-1", "midi-1", 62)]),
      [pitchProposal("proposal-0", "score-0", "midi-0", 61), pitchProposal("proposal-1", "score-1", "midi-1", 62)],
      sourceNotes(),
    );

    expect(consistent.proposals).toHaveLength(1);
    expect(consistent.proposals[0]).toMatchObject({
      scoreNoteIds: ["score-0", "score-1"],
      midiNoteIds: ["midi-0", "midi-1"],
      reviewability: { status: "writeback-ready", reasons: [] },
    });
    expect(conflicting.proposals).toHaveLength(1);
    expect(conflicting.proposals[0]).toMatchObject({
      reviewability: {
        status: "review-only",
        reasons: ["conflicting-playback-suggestions"],
      },
    });
  });

  it("keeps missing and extra notes review-only", () => {
    const result = buildWritebackProposals(
      scoreEvidence([{ id: "score-0", sourceNoteId: "source-0", playbackIteration: 0 }]),
      alignment([]),
      [
        {
          id: "proposal-0",
          type: "midi-supported-missing-note",
          midiNoteId: "midi-0",
          suggestedSoundingMidi: 64,
          confidence: 0.6,
          autoApplicable: false,
          reason: "missing",
        },
        {
          id: "proposal-1",
          type: "unsupported-score-note",
          scoreNoteId: "score-0",
          confidence: 0.6,
          autoApplicable: false,
          reason: "extra",
        },
      ],
      sourceNotes(),
    );

    expect(result.proposals).toEqual([
      expect.objectContaining({
        type: "midi-supported-missing-note",
        reviewability: { status: "review-only", reasons: ["missing-note-notation-underdetermined"] },
      }),
      expect.objectContaining({
        type: "unsupported-score-note",
        reviewability: { status: "review-only", reasons: ["note-removal-structure-risk"] },
      }),
    ]);
  });

  it("keeps tie-chain pitch changes review-only until an atomic chain patch is available", () => {
    const tied = sourceNotes();
    tied.get("source-0")!.facts.tieTypes = ["start"];

    const result = buildWritebackProposals(
      scoreEvidence([{ id: "score-0", sourceNoteId: "source-0", playbackIteration: 0 }]),
      alignment([ambiguous("alignment-0", "score-0", "midi-0", 61)]),
      [pitchProposal("proposal-0", "score-0", "midi-0", 61)],
      tied,
    );

    expect(result.proposals[0]).toMatchObject({
      reviewability: { status: "review-only", reasons: ["tie-chain-writeback-unsupported"] },
    });
  });
});

function scoreEvidence(notes: Array<{ id: string; sourceNoteId: string; playbackIteration: number }>) {
  return {
    schemaVersion: "1.0.0" as const,
    source: { fileName: "score.mxl", sha256: "a".repeat(64), sizeBytes: 1 },
    writtenMeasureCount: 1,
    playbackMeasureOrder: notes.map(() => 0),
    notes: notes.map((note, index) => ({
      ...note,
      partId: "P1",
      staffIndex: 0,
      voice: 1,
      measureIndex: 0,
      playbackMeasureIndex: index,
      writtenOnset: { numerator: 0, denominator: 1 },
      playbackOnset: { numerator: index, denominator: 1 },
      duration: { numerator: 1, denominator: 4 },
      soundingMidi: 60,
    })),
    diagnostics: [],
  };
}

function alignment(entries: Array<Record<string, unknown>>) {
  return {
    schemaVersion: "1.0.0" as const,
    algorithm: {
      id: "zupulse-score-midi-frame-alignment" as const,
      version: "1.0.0" as const,
      parameters: { gapCost: 1, onsetWeight: 0.5, maxReconciliationOnsetDistance: 0.01, maxTracebackCells: 100 },
    },
    compatibility: {
      status: "compatible" as const,
      detectedTransposition: 0,
      chromaSimilarity: 1,
      transpositionMargin: 1,
      scoreNoteCount: entries.length,
      midiNoteCount: entries.length,
      noteCountRatio: 1,
      reasons: [],
    },
    entries,
    summary: {
      matched: 0,
      ambiguous: entries.length,
      scoreOnly: 0,
      midiOnly: 0,
      scoreCoverage: 1,
      midiCoverage: 1,
      pitchAgreement: 0,
      frameAlignmentCost: 0,
    },
  };
}

function sourceNotes(): Map<string, MusicXmlSourceNote> {
  return new Map([
    [
      "source-0",
      {
        locator: {
          rootFilePath: "score.musicxml",
          partId: "P1",
          measureIndex: 0,
          noteIndex: 0,
          preconditionSha256: "c".repeat(64),
        },
        facts: {
          writtenPitch: { step: "C" as const, alter: 0, octave: 4 },
          voice: 1,
          staff: 1,
          durationUnits: 4,
          chord: false,
          tieTypes: [],
        },
      },
    ],
  ]);
}

function ambiguous(id: string, scoreNoteId: string, midiNoteId: string, midiPitch: number) {
  return {
    id,
    status: "ambiguous",
    scoreNoteId,
    midiNoteId,
    scorePitch: 60,
    midiPitch,
    confidence: 0.5,
    reason: "pitch-disagreement",
  };
}

function pitchProposal(id: string, scoreNoteId: string, midiNoteId: string, suggestedSoundingMidi: number) {
  return {
    id,
    type: "pitch-disagreement" as const,
    scoreNoteId,
    midiNoteId,
    suggestedSoundingMidi,
    confidence: 0.5,
    autoApplicable: false as const,
    reason: "disagreement",
  };
}
