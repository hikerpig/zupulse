import type { AdapterOutput } from "../import/types";
import { createImportDiagnostic } from "../import/diagnostics";
import type { Track } from "../score/types";
import { createHarmonyAnalysisInput, type HarmonyAnalysisInput } from "../harmony/analysisInput";

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
      bars?: Array<{ index?: number; voices?: Array<{ beats?: Array<RuntimeBeat> }> }>;
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
  notes?: Array<{ id?: string | number; realValue?: number; isTieDestination?: boolean }>;
};

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
  const measures = (score.masterBars ?? []).map((bar, index) => ({
    index,
    durationTicks: Math.max(1, bar.duration ?? 0),
    timeSignature: { numerator: bar.timeSignatureNumerator ?? 4, denominator: bar.timeSignatureDenominator ?? 4 },
  }));
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
                .map((note, noteIndex) => ({
                  id: `track-${trackIndex + 1}:${measureIndex}:${voiceIndex}:${beatIndex}:${note.id ?? noteIndex}`,
                  moment: { measureIndex: bar.index ?? measureIndex, offsetTicks: beat.displayStart ?? 0 },
                  durationTicks: Math.max(1, beat.displayDuration ?? 0),
                  soundingPitchClass: note.realValue! % 12,
                  voice: voiceIndex + 1,
                })),
            ),
          ),
        ),
      })),
    })),
  });
}
