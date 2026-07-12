import type { z } from "zod";
import type { ScoreIdentity, Section } from "../score/types";
import { createDefaultPlaybackSidecar } from "../playback/playbackSidecar";
import { sidecarPayloadSchema } from "./schemas";

export const SIDECAR_SCHEMA_VERSION = "0.2.0" as const;
const LEGACY_SIDECAR_SCHEMA_VERSION = "0.1.0" as const;
const LEGACY_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export type SidecarPayload = z.infer<typeof sidecarPayloadSchema>;
export type LoopRange = SidecarPayload["practice"]["loops"][number];
export type Annotation = SidecarPayload["practice"]["annotations"][number];
export type TrackOverride = SidecarPayload["tracks"][string];
export type QuantizationSettings = NonNullable<SidecarPayload["midi"]>["quantization"];
export type MidiMeasureCorrection = NonNullable<SidecarPayload["midi"]>["measureCorrections"][string];

export function createDefaultSidecar(identity: ScoreIdentity, now = new Date().toISOString()): SidecarPayload {
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
  return JSON.stringify(sidecarPayloadSchema.parse(payload), null, 2);
}

export function decodeSidecar(json: string): SidecarPayload {
  const parsed = JSON.parse(json) as { schemaVersion?: unknown };

  if (parsed.schemaVersion === LEGACY_SIDECAR_SCHEMA_VERSION) {
    return sidecarPayloadSchema.parse(migrateLegacySidecar(parsed as LegacySidecarPayload));
  }
  if (parsed.schemaVersion === SIDECAR_SCHEMA_VERSION) {
    return sidecarPayloadSchema.parse(parsed);
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
  playback.loops = legacy.practice.loops.map((loop) => ({
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
