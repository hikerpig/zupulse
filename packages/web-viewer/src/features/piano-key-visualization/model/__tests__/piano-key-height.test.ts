import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIANO_KEY_HEIGHT,
  MAX_PIANO_KEY_HEIGHT,
  MIN_PIANO_KEY_HEIGHT,
  clampPianoKeyHeight,
} from "../piano-key-height";

describe("clampPianoKeyHeight", () => {
  it("uses a taller default and preserves enough score space inside short workspaces", () => {
    expect(DEFAULT_PIANO_KEY_HEIGHT).toBe(260);
    expect(clampPianoKeyHeight(100)).toBe(MIN_PIANO_KEY_HEIGHT);
    expect(clampPianoKeyHeight(600)).toBe(MAX_PIANO_KEY_HEIGHT);
    expect(clampPianoKeyHeight(400, 500)).toBe(312);
  });
});
