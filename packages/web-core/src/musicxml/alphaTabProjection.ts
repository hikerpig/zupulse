import type { AdapterOutput } from "../import/types";
import { createImportDiagnostic } from "../import/diagnostics";
import type { Track } from "../score/types";

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
