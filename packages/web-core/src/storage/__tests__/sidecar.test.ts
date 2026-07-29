import { describe, expect, it } from "vitest";
import { createDefaultSidecar, decodeSidecar, encodeSidecar } from "../sidecar";
import type { ScoreIdentity } from "../../score/types";

const identity: ScoreIdentity = {
  contentHash: "a".repeat(64),
  format: "midi",
  title: "Etude",
  sourceHints: {
    fileName: "etude.mid",
  },
};

describe("sidecar codec", () => {
  it("creates default sidecar payload bound to score identity", () => {
    expect(createDefaultSidecar(identity, "2026-07-10T00:00:00.000Z")).toEqual({
      schemaVersion: "0.3.0",
      identity,
      practice: {
        loops: [],
        sections: [],
        annotations: [],
        playback: {
          scoreSpeed: {
            value: 1,
            updatedAt: "2026-07-10T00:00:00.000Z",
          },
          rhythm: {
            metronome: {
              enabled: false,
              volume: 60,
              updatedAt: "2026-07-10T00:00:00.000Z",
            },
            countIn: {
              enabled: false,
              volume: 70,
              updatedAt: "2026-07-10T00:00:00.000Z",
            },
          },
          pianoPractice: {
            mode: "both-hands",
            updatedAt: "2026-07-10T00:00:00.000Z",
          },
          loops: [],
          visibility: {
            additionalTrackIds: [],
            updatedAt: "2026-07-10T00:00:00.000Z",
          },
          tracks: {},
        },
      },
      tracks: {},
    });
  });

  it("round-trips sidecar JSON", () => {
    const payload = createDefaultSidecar(identity);
    const decoded = decodeSidecar(encodeSidecar(payload));

    expect(decoded).toEqual(payload);
  });

  it("rejects unsupported sidecar schema version", () => {
    const json = JSON.stringify({
      ...createDefaultSidecar(identity),
      schemaVersion: "9.9.9",
    });

    expect(() => decodeSidecar(json)).toThrow("Unsupported sidecar schema version: 9.9.9");
  });

  it("migrates 0.1.0 loop ranges into playback loop regions", () => {
    const decoded = decodeSidecar(
      JSON.stringify({
        schemaVersion: "0.1.0",
        identity,
        practice: {
          loops: [{ id: "legacy-loop", startTick: 120, endTick: 960 }],
          sections: [],
          annotations: [],
        },
        tracks: {},
      }),
    );

    expect(decoded.schemaVersion).toBe("0.3.0");
    expect(decoded.practice.playback.loops[0]).toMatchObject({
      id: "legacy-loop",
      start: { measureId: "legacy", tick: 120 },
      end: { measureId: "legacy", tick: 960 },
      snapMode: "off",
    });
    expect(decoded.practice.playback.loops[0]).not.toHaveProperty("label");
  });

  it("migrates 0.2.0 playback settings with foundational practice defaults", () => {
    const legacy = createDefaultSidecar(identity, "2026-07-10T00:00:00.000Z");
    const playback = structuredClone(legacy.practice.playback) as Record<string, unknown>;
    delete playback.rhythm;
    delete playback.pianoPractice;

    const decoded = decodeSidecar(
      JSON.stringify({
        ...legacy,
        schemaVersion: "0.2.0",
        practice: { ...legacy.practice, playback },
      }),
    );

    expect(decoded.schemaVersion).toBe("0.3.0");
    expect(decoded.practice.playback.rhythm).toEqual({
      metronome: { enabled: false, volume: 60, updatedAt: "1970-01-01T00:00:00.000Z" },
      countIn: { enabled: false, volume: 70, updatedAt: "1970-01-01T00:00:00.000Z" },
    });
    expect(decoded.practice.playback.pianoPractice).toEqual({
      mode: "both-hands",
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });
});
