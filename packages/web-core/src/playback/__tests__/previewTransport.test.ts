import { describe, expect, it } from "vitest";
import { reducePreviewTransport } from "../previewTransport";

describe("preview transport", () => {
  it("changes only ephemeral playback state", () => {
    const initial = { status: "paused" as const, positionTicks: 0, speed: 1 };
    expect(reducePreviewTransport(initial, { type: "play" })).toEqual({
      status: "playing",
      positionTicks: 0,
      speed: 1,
    });
    expect(reducePreviewTransport(initial, { type: "speed", speed: 10 }).speed).toBe(4);
  });
});
