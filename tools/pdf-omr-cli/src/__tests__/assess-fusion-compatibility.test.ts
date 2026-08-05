import { describe, expect, it } from "vitest";
import { assessFusionCompatibility } from "../fusion/assess-compatibility";
import type { ScoreEvidence } from "../fusion/schemas";
import type { PerformanceEvidence } from "../midi/schemas";

describe("assessFusionCompatibility", () => {
  it("detects a stable score-export transposition", () => {
    const score = scoreEvidence([60, 64, 67, 72, 76, 79]);
    const midi = performanceEvidence([62, 66, 69, 74, 78, 81]);

    expect(assessFusionCompatibility(score, midi)).toMatchObject({
      status: "compatible",
      detectedTransposition: 2,
      scoreNoteCount: 6,
      midiNoteCount: 6,
      noteCountRatio: 1,
      reasons: [],
    });
  });

  it("rejects inputs with an implausible note-count ratio before proposals", () => {
    const result = assessFusionCompatibility(scoreEvidence([60, 62, 64, 65, 67, 69]), performanceEvidence([60, 62]));

    expect(result.status).toBe("incompatible");
    expect(result.reasons).toContain("note-count-ratio-out-of-range");
  });

  it("uses the smallest absolute transposition as deterministic tie-break", () => {
    const result = assessFusionCompatibility(scoreEvidence([60, 64]), performanceEvidence([58, 62, 62, 66]));

    expect(result.detectedTransposition).toBe(-2);
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("transposition-ambiguous");
  });
});

function scoreEvidence(pitches: number[]): ScoreEvidence {
  return {
    schemaVersion: "1.0.0",
    source: { fileName: "score.mxl", sha256: "a".repeat(64), sizeBytes: 1 },
    writtenMeasureCount: 1,
    playbackMeasureOrder: [0],
    notes: pitches.map((pitch, index) => ({
      id: `score-${index}`,
      partId: "P1",
      staffIndex: 0,
      voice: 1,
      measureIndex: 0,
      playbackMeasureIndex: 0,
      playbackIteration: 0,
      writtenOnset: { numerator: index, denominator: 4 },
      playbackOnset: { numerator: index, denominator: 4 },
      duration: { numerator: 1, denominator: 4 },
      soundingMidi: pitch,
      sourceNoteId: `source-${index}`,
    })),
    diagnostics: [],
  };
}

function performanceEvidence(pitches: number[]): PerformanceEvidence {
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
    tracks: [{ trackIndex: 0, endTick: pitches.length * 480, channels: [0], programs: [] }],
    notes: pitches.map((pitch, index) => ({
      id: `midi-${index}`,
      trackIndex: 0,
      channel: 0,
      noteIndex: index,
      pitch,
      velocity: 80,
      onsetTick: index * 480,
      keyReleaseTick: index * 480 + 240,
      soundOffTick: index * 480 + 240,
      onsetSeconds: index * 0.5,
      keyReleaseSeconds: index * 0.5 + 0.25,
      soundOffSeconds: index * 0.5 + 0.25,
      source: {
        noteOn: { trackIndex: 0, eventIndex: index * 2, absoluteTick: index * 480 },
        noteOff: { trackIndex: 0, eventIndex: index * 2 + 1, absoluteTick: index * 480 + 240 },
      },
      flags: [],
    })),
    controls: [],
    diagnostics: [],
  };
}
