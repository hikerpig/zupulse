export type ScoreFormat = "gp" | "midi";

export type SupportedExtension =
  | ".gp3"
  | ".gp4"
  | ".gp5"
  | ".gpx"
  | ".gp"
  | ".mid"
  | ".midi";

export type ScoreIdentity = {
  contentHash: string;
  format: ScoreFormat;
  title?: string;
  artist?: string;
  durationMs?: number;
  sourceHints?: {
    fileName?: string;
    trackNames?: string[];
    tempoSummary?: string;
  };
};

export type ScoreSource = {
  fileName: string;
  sizeBytes: number;
  format: ScoreFormat;
};

export type ScoreSummary = {
  title: string;
  trackCount: number;
  durationMs?: number;
};

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

export type TrackPlaybackSettings = {
  muted: boolean;
  solo: boolean;
  volume: number;
};

export type Staff = {
  id: string;
  measures: Measure[];
};

export type Beat = {
  id: string;
  startTick: number;
  durationTicks: number;
  notes: Note[];
};

export type MeasureAnalysis = {
  hasQuantizationWarning: boolean;
  hasOverlappingNotes: boolean;
  isReadableAsNotation: boolean;
};

export type Note = {
  id: string;
  pitch?: number;
  string?: number;
  fret?: number;
  startTick: number;
  durationTicks: number;
  velocity?: number;
  tie?: "start" | "continue" | "end";
  hand?: "left" | "right" | "unknown";
};

export type Measure = {
  id: string;
  index: number;
  startTick: number;
  durationTicks: number;
  timeSignature: TimeSignature;
  beats: Beat[];
  analysis?: MeasureAnalysis;
};

export type Track = {
  id: string;
  name: string;
  instrument?: string;
  channel?: number;
  staves: Staff[];
  playback: TrackPlaybackSettings;
};

export type PlaybackTimeline = {
  ticksPerQuarter: number;
  durationTicks: number;
  durationMs?: number;
};

export type Section = {
  id: string;
  name: string;
  startTick: number;
  endTick: number;
};

export type SourceExtensions = {
  gp?: Record<string, unknown>;
  midi?: Record<string, unknown>;
};

export type ScoreDocument = {
  schemaVersion: string;
  identity: ScoreIdentity;
  source: ScoreSource;
  summary: ScoreSummary;
  tracks: Track[];
  timeline: PlaybackTimeline;
  sections: Section[];
  extensions?: SourceExtensions;
};
