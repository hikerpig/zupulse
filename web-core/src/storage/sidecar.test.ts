import { describe, expect, it } from "vitest";
import { createDefaultSidecar, decodeSidecar, encodeSidecar } from "./sidecar";
import type { ScoreIdentity } from "../score/types";

const identity: ScoreIdentity = {
  contentHash: "abc123",
  format: "midi",
  title: "Etude",
  sourceHints: {
    fileName: "etude.mid",
  },
};

describe("sidecar codec", () => {
  it("creates default sidecar payload bound to score identity", () => {
    expect(createDefaultSidecar(identity)).toEqual({
      schemaVersion: "0.1.0",
      identity,
      practice: {
        loops: [],
        sections: [],
        annotations: [],
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
});
