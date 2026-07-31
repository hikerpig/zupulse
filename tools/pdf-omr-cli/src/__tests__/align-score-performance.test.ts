import { describe, expect, it } from "vitest";
import { alignScorePerformance } from "../fusion/align-score-performance";
import type { FusionCompatibility, ScoreEvidence } from "../fusion/schemas";
import type { PerformanceEvidence } from "../midi/schemas";

describe("alignScorePerformance", () => {
  it("aligns exact chords and reports MIDI-supported missing notes", () => {
    const score = scoreEvidence([
      { pitch: 60, onset: 0 },
      { pitch: 64, onset: 0 },
      { pitch: 67, onset: 1 },
    ]);
    const midi = performanceEvidence([
      { pitch: 60, tick: 0 },
      { pitch: 64, tick: 0 },
      { pitch: 67, tick: 480 },
      { pitch: 71, tick: 480 },
    ]);

    const result = alignScorePerformance(score, midi, compatible());

    expect(result.alignment.summary).toMatchObject({
      matched: 3,
      ambiguous: 0,
      scoreOnly: 0,
      midiOnly: 1,
      scoreCoverage: 1,
      midiCoverage: 0.75,
      pitchAgreement: 1,
    });
    expect(result.repairProposals).toContainEqual(
      expect.objectContaining({
        type: "midi-supported-missing-note",
        midiNoteId: "midi-3",
        autoApplicable: false,
      }),
    );
  });

  it("reports pitch disagreements without making them auto-applicable", () => {
    const score = scoreEvidence([{ pitch: 60, onset: 0 }]);
    const midi = performanceEvidence([{ pitch: 61, tick: 0 }]);

    const result = alignScorePerformance(score, midi, compatible());

    expect(result.alignment.entries).toEqual([
      expect.objectContaining({
        status: "ambiguous",
        scoreNoteId: "score-0",
        midiNoteId: "midi-0",
        reason: "pitch-disagreement",
      }),
    ]);
    expect(result.repairProposals).toEqual([
      expect.objectContaining({
        type: "pitch-disagreement",
        scoreNoteId: "score-0",
        midiNoteId: "midi-0",
        suggestedSoundingMidi: 61,
        autoApplicable: false,
      }),
    ]);
  });

  it("reconciles equal pitches across a nearby frame boundary", () => {
    const score = scoreEvidence([
      { pitch: 60, onset: 0 },
      { pitch: 64, onset: 1 },
      { pitch: 67, onset: 100 },
    ]);
    const midi = performanceEvidence([
      { pitch: 60, tick: 0 },
      { pitch: 64, tick: 0 },
      { pitch: 67, tick: 48_000 },
    ]);

    const result = alignScorePerformance(score, midi, compatible());

    expect(result.alignment.summary).toMatchObject({
      matched: 3,
      scoreOnly: 0,
      midiOnly: 0,
      scoreCoverage: 1,
      midiCoverage: 1,
    });
    expect(result.repairProposals).toEqual([]);
  });

  it("does not align or propose repairs for incompatible pieces", () => {
    const result = alignScorePerformance(
      scoreEvidence([{ pitch: 60, onset: 0 }]),
      performanceEvidence([{ pitch: 72, tick: 0 }]),
      { ...compatible(), status: "incompatible", reasons: ["chroma-similarity-too-low"] },
    );

    expect(result.alignment.entries).toEqual([]);
    expect(result.repairProposals).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "FUSION_INPUTS_INCOMPATIBLE", severity: "blocking" }),
    );
  });

  it("excludes percussion-channel notes from alignment metrics and proposals", () => {
    const midi = performanceEvidence([
      { pitch: 60, tick: 0 },
      { pitch: 36, tick: 0 },
    ]);
    midi.notes[1]!.channel = 9;
    midi.notes[1]!.flags = ["percussion-channel"];

    const result = alignScorePerformance(scoreEvidence([{ pitch: 60, onset: 0 }]), midi, compatible());

    expect(result.alignment.summary).toMatchObject({
      matched: 1,
      midiOnly: 0,
      midiCoverage: 1,
    });
    expect(result.repairProposals).toEqual([]);
  });
});

function compatible(): FusionCompatibility {
  return {
    status: "compatible",
    detectedTransposition: 0,
    chromaSimilarity: 1,
    transpositionMargin: 1,
    scoreNoteCount: 3,
    midiNoteCount: 3,
    noteCountRatio: 1,
    reasons: [],
  };
}

function scoreEvidence(notes: Array<{ pitch: number; onset: number }>): ScoreEvidence {
  return {
    schemaVersion: "1.0.0",
    source: { fileName: "score.mxl", sha256: "a".repeat(64), sizeBytes: 1 },
    writtenMeasureCount: 1,
    playbackMeasureOrder: [0],
    notes: notes.map((note, index) => ({
      id: `score-${index}`,
      partId: "P1",
      staffIndex: 0,
      voice: 1,
      measureIndex: 0,
      playbackMeasureIndex: 0,
      playbackIteration: 0,
      writtenOnset: { numerator: note.onset, denominator: 4 },
      playbackOnset: { numerator: note.onset, denominator: 4 },
      duration: { numerator: 1, denominator: 4 },
      soundingMidi: note.pitch,
      sourceNoteId: `source-${index}`,
    })),
    diagnostics: [],
  };
}

function performanceEvidence(notes: Array<{ pitch: number; tick: number }>): PerformanceEvidence {
  const endTick = Math.max(0, ...notes.map((note) => note.tick + 240));
  return {
    schemaVersion: "1.0.0",
    source: {
      fileName: "score.mid",
      sha256: "b".repeat(64),
      sizeBytes: 1,
      smfFormat: 1,
      trackCount: 1,
      ticksPerQuarter: 480,
    },
    tempoTimeline: {
      changes: [{ tick: 0, microsecondsPerQuarter: 500_000, origin: "default", sources: [] }],
      segments: [{ startTick: 0, startSeconds: 0, microsecondsPerQuarter: 500_000 }],
    },
    timeSignatures: [],
    tracks: [{ trackIndex: 0, endTick, channels: [0], programs: [] }],
    notes: notes.map((note, index) => ({
      id: `midi-${index}`,
      trackIndex: 0,
      channel: 0,
      noteIndex: index,
      pitch: note.pitch,
      velocity: 80,
      onsetTick: note.tick,
      keyReleaseTick: note.tick + 240,
      soundOffTick: note.tick + 240,
      onsetSeconds: note.tick / 960,
      keyReleaseSeconds: (note.tick + 240) / 960,
      soundOffSeconds: (note.tick + 240) / 960,
      source: {
        noteOn: { trackIndex: 0, eventIndex: index * 2, absoluteTick: note.tick },
        noteOff: { trackIndex: 0, eventIndex: index * 2 + 1, absoluteTick: note.tick + 240 },
      },
      flags: [],
    })),
    controls: [],
    diagnostics: [],
  };
}
