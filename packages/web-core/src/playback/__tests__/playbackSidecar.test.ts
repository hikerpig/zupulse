import { describe, expect, it } from "vitest";
import { createDefaultPlaybackSidecar, mergePlaybackSidecar } from "../playbackSidecar";
import { practicePlaybackSidecarSchema } from "../schemas";
import type { LoopRegion } from "../types";

describe("playback sidecar", () => {
  it("does not contain transport, resume position, or solo", () => {
    const sidecar = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");

    expect(sidecar.scoreSpeed.value).toBe(1);
    expect(sidecar.loops).toEqual([]);
    expect(JSON.stringify(sidecar)).not.toContain("transport");
    expect(JSON.stringify(sidecar)).not.toContain("resume");
    expect(JSON.stringify(sidecar)).not.toContain("solo");
  });

  it("merges loops by id and newest updatedAt, including tombstones", () => {
    const local = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    const remote = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    local.loops = [loop("loop-1", "2026-07-10T01:00:00Z")];
    remote.loops = [
      {
        ...loop("loop-1", "2026-07-10T02:00:00Z"),
        deletedAt: "2026-07-10T02:00:00Z",
      },
    ];

    expect(mergePlaybackSidecar(local, remote).loops[0]?.deletedAt).toBe("2026-07-10T02:00:00Z");
  });

  it("merges mute and volume independently", () => {
    const local = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    const remote = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    local.tracks["track-0"] = {
      muted: true,
      muteUpdatedAt: "2026-07-10T03:00:00Z",
      volume: 0.4,
      volumeUpdatedAt: "2026-07-10T01:00:00Z",
    };
    remote.tracks["track-0"] = {
      muted: false,
      muteUpdatedAt: "2026-07-10T02:00:00Z",
      volume: 0.8,
      volumeUpdatedAt: "2026-07-10T04:00:00Z",
    };

    expect(mergePlaybackSidecar(local, remote).tracks["track-0"]).toEqual({
      muted: true,
      muteUpdatedAt: "2026-07-10T03:00:00Z",
      volume: 0.8,
      volumeUpdatedAt: "2026-07-10T04:00:00Z",
    });
  });

  it("rejects playback settings outside persisted ranges", () => {
    const sidecar = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    sidecar.scoreSpeed.value = 3;

    expect(() => practicePlaybackSidecarSchema.parse(sidecar)).toThrow();
  });
});

function loop(id: string, updatedAt: string): LoopRegion {
  return {
    id,
    label: "小节 1–2",
    labelSource: "generated",
    start: {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 0,
      cachedTimeMs: 0,
    },
    end: {
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 0,
      tick: 1920,
      cachedTimeMs: 4000,
    },
    snapMode: "beat",
    createdAt: "2026-07-10T00:00:00Z",
    updatedAt,
  };
}
