import type { ScoreIdentity, Section } from "../score/types";
import {
  createDefaultPlaybackSidecar,
  validatePlaybackSidecar,
  type PracticePlaybackSidecar,
} from "../playback/playbackSidecar";

export const SIDECAR_SCHEMA_VERSION = "0.2.0" as const;
const LEGACY_SIDECAR_SCHEMA_VERSION = "0.1.0" as const;
const LEGACY_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export type LoopRange = {
  id: string;
  startTick: number;
  endTick: number;
};

export type Annotation = {
  id: string;
  tick: number;
  text: string;
  updatedAt: string;
};

export type TrackOverride = {
  muted?: boolean;
  solo?: boolean;
  volume?: number;
  instrument?: string;
};

export type QuantizationSettings = {
  grid: "1/8" | "1/16" | "1/32";
  swing: boolean;
};

export type MidiMeasureCorrection = {
  measureId: string;
  quantization?: QuantizationSettings;
  handAssignments?: Record<string, "left" | "right" | "unknown">;
};

export type SidecarPayload = {
  schemaVersion: typeof SIDECAR_SCHEMA_VERSION;
  identity: ScoreIdentity;
  practice: {
    tempoOverride?: number;
    transpose?: number;
    loops: LoopRange[];
    sections: Section[];
    annotations: Annotation[];
    playback: PracticePlaybackSidecar;
  };
  tracks: Record<string, TrackOverride>;
  midi?: {
    quantization: QuantizationSettings;
    handAssignments: Record<string, "left" | "right" | "unknown">;
    measureCorrections: Record<string, MidiMeasureCorrection>;
  };
};

export function createDefaultSidecar(
  identity: ScoreIdentity,
  now = new Date().toISOString(),
): SidecarPayload {
  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    identity,
    practice: {
      loops: [],
      sections: [],
      annotations: [],
      playback: createDefaultPlaybackSidecar(now),
    },
    tracks: {},
  };
}

export function encodeSidecar(payload: SidecarPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function decodeSidecar(json: string): SidecarPayload {
  const parsed = JSON.parse(json) as { schemaVersion?: unknown };

  if (parsed.schemaVersion === LEGACY_SIDECAR_SCHEMA_VERSION) {
    return migrateLegacySidecar(parsed as LegacySidecarPayload);
  }
  if (parsed.schemaVersion === SIDECAR_SCHEMA_VERSION) {
    const current = parsed as SidecarPayload;
    validatePlaybackSidecar(current.practice.playback);
    return current;
  }

  throw new Error(`Unsupported sidecar schema version: ${String(parsed.schemaVersion)}`);
}

type LegacySidecarPayload = {
  schemaVersion: typeof LEGACY_SIDECAR_SCHEMA_VERSION;
  identity: ScoreIdentity;
  practice: {
    tempoOverride?: number;
    transpose?: number;
    loops: LoopRange[];
    sections: Section[];
    annotations: Annotation[];
  };
  tracks: Record<string, TrackOverride>;
  midi?: SidecarPayload["midi"];
};

function migrateLegacySidecar(legacy: LegacySidecarPayload): SidecarPayload {
  const playback = createDefaultPlaybackSidecar(LEGACY_TIMESTAMP);
  playback.loops = legacy.practice.loops.map(loop => ({
    id: loop.id,
    label: `循环 ${loop.id}`,
    labelSource: "generated",
    start: legacyPosition(loop.startTick),
    end: legacyPosition(loop.endTick),
    snapMode: "off",
    createdAt: LEGACY_TIMESTAMP,
    updatedAt: LEGACY_TIMESTAMP,
  }));

  for (const [trackId, override] of Object.entries(legacy.tracks)) {
    if (override.muted === undefined && override.volume === undefined) continue;
    playback.tracks[trackId] = {
      muted: override.muted ?? false,
      volume: override.volume ?? 1,
      muteUpdatedAt: LEGACY_TIMESTAMP,
      volumeUpdatedAt: LEGACY_TIMESTAMP,
    };
  }

  const practice: SidecarPayload["practice"] = {
    loops: legacy.practice.loops,
    sections: legacy.practice.sections,
    annotations: legacy.practice.annotations,
    playback,
  };
  if (legacy.practice.tempoOverride !== undefined) {
    practice.tempoOverride = legacy.practice.tempoOverride;
  }
  if (legacy.practice.transpose !== undefined) {
    practice.transpose = legacy.practice.transpose;
  }

  const migrated: SidecarPayload = {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    identity: legacy.identity,
    practice,
    tracks: legacy.tracks,
  };
  if (legacy.midi !== undefined) {
    migrated.midi = legacy.midi;
  }
  return migrated;
}

function legacyPosition(tick: number) {
  return {
    measureId: "legacy",
    measureIndex: -1,
    beatIndex: -1,
    tick,
    cachedTimeMs: 0,
  };
}
