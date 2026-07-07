import type { ScoreIdentity, Section } from "../score/types";

export const SIDECAR_SCHEMA_VERSION = "0.1.0" as const;

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
  };
  tracks: Record<string, TrackOverride>;
  midi?: {
    quantization: QuantizationSettings;
    handAssignments: Record<string, "left" | "right" | "unknown">;
    measureCorrections: Record<string, MidiMeasureCorrection>;
  };
};

export function createDefaultSidecar(identity: ScoreIdentity): SidecarPayload {
  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    identity,
    practice: {
      loops: [],
      sections: [],
      annotations: [],
    },
    tracks: {},
  };
}

export function encodeSidecar(payload: SidecarPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function decodeSidecar(json: string): SidecarPayload {
  const parsed = JSON.parse(json) as SidecarPayload;

  if (parsed.schemaVersion !== SIDECAR_SCHEMA_VERSION) {
    throw new Error(`Unsupported sidecar schema version: ${parsed.schemaVersion}`);
  }

  return parsed;
}
