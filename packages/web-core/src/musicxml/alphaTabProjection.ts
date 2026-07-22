import type { AdapterOutput } from "../import/types";
import { createImportDiagnostic } from "../import/diagnostics";
import type { Track } from "../score/types";
import { createHarmonyAnalysisInput, type HarmonyAnalysisInput } from "../harmony/analysisInput";
import type { ChordSymbolInput } from "../harmony/schemas";

type RuntimeScore = {
  title?: string;
  artist?: string;
  tempo?: number;
  tracks?: Array<{ name?: string; shortName?: string; playbackInfo?: { isPercussion?: boolean }; staves?: unknown[] }>;
  masterBars?: Array<{
    index?: number;
    start?: number;
    duration?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
  }>;
};

type HarmonyRuntimeScore = Omit<RuntimeScore, "tracks" | "masterBars"> & {
  tracks?: Array<{
    name?: string;
    playbackInfo?: { isPercussion?: boolean };
    staves?: Array<{
      index?: number;
      isPercussion?: boolean;
      bars?: Array<{ index?: number; keySignature?: number; voices?: Array<{ beats?: Array<RuntimeBeat> }> }>;
    }>;
  }>;
  masterBars?: Array<{
    index?: number;
    duration?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
  }>;
};

type RuntimeBeat = {
  id?: string | number;
  index?: number;
  displayStart?: number;
  displayDuration?: number;
  notes?: Array<{
    id?: string | number;
    realValue?: number;
    accidentalMode?: number;
    isTieDestination?: boolean;
  }>;
};

const naturalPitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
const sharpPitchClasses: readonly ChordSymbolInput["root"][] = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];
const flatPitchClasses: readonly ChordSymbolInput["root"][] = [
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

export function projectAlphaTabScore(score: RuntimeScore): Omit<AdapterOutput, "runtime"> {
  const runtimeTracks = score.tracks ?? [];
  const masterBars = score.masterBars ?? [];
  const tracks: Track[] = runtimeTracks.map((track, index) => ({
    id: `track-${index + 1}`,
    name: track.name || track.shortName || `Part ${index + 1}`,
    staves: (track.staves ?? []).map((_, staffIndex) => ({
      id: `track-${index + 1}-staff-${staffIndex + 1}`,
      measures: [],
    })),
    playback: { muted: false, solo: false, volume: 1 },
  }));
  const durationTicks = masterBars.reduce((max, bar) => Math.max(max, (bar.start ?? 0) + (bar.duration ?? 0)), 0);
  const playback = durationTicks > 0;
  const diagnostics = playback ? [] : [createImportDiagnostic("no-playable-timeline")];
  return {
    document: {
      schemaVersion: "0.3.0",
      summary: { title: score.title || "Untitled", trackCount: tracks.length },
      tracks,
      timeline: { ticksPerQuarter: 960, durationTicks },
      sections: [],
      extensions: { musicxml: { masterBarCount: masterBars.length, tempo: score.tempo ?? null } },
    },
    diagnostics,
    capabilities: { view: tracks.length > 0 && masterBars.length > 0, playback },
  };
}

export function getDefaultVisibleTrackIds(score: RuntimeScore): string[] {
  const tracks = score.tracks ?? [];
  if (tracks.length <= 4) return tracks.map((_, index) => `track-${index + 1}`);
  const index = tracks.findIndex((track) => !track.playbackInfo?.isPercussion);
  return [`track-${(index < 0 ? 0 : index) + 1}`];
}

export function projectAlphaTabHarmonyInput(score: HarmonyRuntimeScore): HarmonyAnalysisInput {
  const keySignatures = measureKeySignatures(score);
  const measures = (score.masterBars ?? []).map((bar, index) => {
    const keySignature = keySignatures.get(index);
    return {
      index,
      durationTicks: Math.max(1, bar.duration ?? 0),
      timeSignature: { numerator: bar.timeSignatureNumerator ?? 4, denominator: bar.timeSignatureDenominator ?? 4 },
      ...(keySignature === undefined ? {} : { key: `fifths:${keySignature}` }),
    };
  });
  return createHarmonyAnalysisInput({
    ticksPerQuarter: 960,
    measures,
    tracks: (score.tracks ?? []).map((track, trackIndex) => ({
      id: `track-${trackIndex + 1}`,
      name: track.name || `Part ${trackIndex + 1}`,
      isPercussion: Boolean(track.playbackInfo?.isPercussion),
      staves: (track.staves ?? []).map((staff, staffIndex) => ({
        index: staff.index ?? staffIndex,
        notes: (staff.bars ?? []).flatMap((bar, measureIndex) =>
          (bar.voices ?? []).flatMap((voice, voiceIndex) =>
            (voice.beats ?? []).flatMap((beat, beatIndex) =>
              (beat.notes ?? [])
                .filter((note) => note.realValue !== undefined && !note.isTieDestination)
                .map((note, noteIndex) => {
                  const pitchClass = note.realValue! % 12;
                  return {
                    id: `track-${trackIndex + 1}:${measureIndex}:${voiceIndex}:${beatIndex}:${note.id ?? noteIndex}`,
                    moment: { measureIndex: bar.index ?? measureIndex, offsetTicks: beat.displayStart ?? 0 },
                    durationTicks: Math.max(1, beat.displayDuration ?? 0),
                    soundingPitchClass: pitchClass,
                    soundingMidi: note.realValue!,
                    spelling: alphaTabSpelling(pitchClass, note.accidentalMode, bar.keySignature),
                    voice: voiceIndex + 1,
                  };
                }),
            ),
          ),
        ),
      })),
    })),
  });
}

function measureKeySignatures(score: HarmonyRuntimeScore): Map<number, number> {
  const signatures = new Map<number, number>();
  for (const track of score.tracks ?? [])
    for (const staff of track.staves ?? [])
      for (const [index, bar] of (staff.bars ?? []).entries())
        if (bar.keySignature !== undefined && !signatures.has(bar.index ?? index))
          signatures.set(bar.index ?? index, bar.keySignature);
  return signatures;
}

function alphaTabSpelling(
  pitchClass: number,
  accidentalMode: number | undefined,
  keySignature: number | undefined,
): ChordSymbolInput["root"] {
  const forcedAlter = forcedAlterForAccidentalMode(accidentalMode);
  if (forcedAlter !== undefined) {
    for (const [step, naturalPitchClass] of Object.entries(naturalPitchClasses) as Array<
      [ChordSymbolInput["root"]["step"], number]
    >)
      if ((naturalPitchClass + forcedAlter + 24) % 12 === pitchClass) return { step, alter: forcedAlter };
  }
  return (keySignature ?? 0) < 0 ? flatPitchClasses[pitchClass]! : sharpPitchClasses[pitchClass]!;
}

function forcedAlterForAccidentalMode(
  accidentalMode: number | undefined,
): ChordSymbolInput["root"]["alter"] | undefined {
  if (accidentalMode === 2) return 0;
  if (accidentalMode === 3) return 1;
  if (accidentalMode === 4) return 2;
  if (accidentalMode === 5) return -1;
  if (accidentalMode === 6) return -2;
  return undefined;
}
