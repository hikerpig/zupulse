import { describe, expect, it } from "vitest";
import { createDefaultSidecar, decodeSidecar, encodeSidecar } from "./sidecar";
import { localPlaybackResumeSchema, sidecarPayloadSchema } from "./schemas";

const identity = { contentHash: "a".repeat(64), format: "gp" as const };
const now = "2026-07-10T00:00:00.000Z";

describe("storage schemas", () => {
  it.each([
    ["short", "a".repeat(63)],
    ["non-hex", "g".repeat(64)],
    ["long", "a".repeat(65)],
  ])("rejects a %s content hash", (_name, contentHash) => {
    expect(() => sidecarPayloadSchema.parse(createDefaultSidecar({ ...identity, contentHash }, now))).toThrow();
  });

  it("accepts valid sidecar and resume payloads", () => {
    expect(sidecarPayloadSchema.parse(createDefaultSidecar(identity, now)).identity).toEqual(identity);
    expect(
      localPlaybackResumeSchema.parse({
        position: {
          measureId: "m1",
          measureIndex: 0,
          beatIndex: 0,
          tick: 0,
          cachedTimeMs: 0,
        },
        updatedAt: now,
      }).updatedAt,
    ).toBe(now);
  });

  it.each([
    [
      "score speed",
      (payload: ReturnType<typeof createDefaultSidecar>) => {
        payload.practice.playback.scoreSpeed.value = 2.01;
      },
    ],
    [
      "track volume",
      (payload: ReturnType<typeof createDefaultSidecar>) => {
        payload.practice.playback.tracks.guitar = {
          muted: false,
          volume: -0.01,
          muteUpdatedAt: now,
          volumeUpdatedAt: now,
        };
      },
    ],
    [
      "timestamp",
      (payload: ReturnType<typeof createDefaultSidecar>) => {
        payload.practice.playback.scoreSpeed.updatedAt = "yesterday";
      },
    ],
  ])("rejects invalid %s", (_name, mutate) => {
    const payload = createDefaultSidecar(identity, now);
    mutate(payload);
    expect(() => sidecarPayloadSchema.parse(payload)).toThrow();
  });

  it("rejects loops whose start does not precede the end", () => {
    const payload = createDefaultSidecar(identity, now);
    payload.practice.playback.loops.push({
      id: "loop-1",
      label: "Loop",
      labelSource: "user",
      start: { measureId: "m1", measureIndex: 0, beatIndex: 0, tick: 480, cachedTimeMs: 500 },
      end: { measureId: "m1", measureIndex: 0, beatIndex: 0, tick: 480, cachedTimeMs: 500 },
      snapMode: "beat",
      createdAt: now,
      updatedAt: now,
    });
    expect(() => sidecarPayloadSchema.parse(payload)).toThrow("Loop start must precede end");
  });

  it("rejects unknown persisted fields when encoding and decoding", () => {
    const payload = { ...createDefaultSidecar(identity, now), legacy: true };
    expect(() => encodeSidecar(payload)).toThrow();
    expect(() => decodeSidecar(JSON.stringify(payload))).toThrow();
  });
});
