import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "../bridge/mockNativeBridge";
import type { ScoreIdentity } from "../score/types";
import { createDefaultSidecar } from "../storage/sidecar";
import { BridgePlaybackPersistence } from "./playbackPersistence";

const identity: ScoreIdentity = {
  contentHash: "a".repeat(64),
  format: "gp",
  title: "Practice",
};

describe("BridgePlaybackPersistence", () => {
  it("round-trips sidecar and local resume through bridge RPC", async () => {
    const persistence = new BridgePlaybackPersistence(new MockNativeBridge());
    const sidecar = createDefaultSidecar(identity, "2026-07-10T00:00:00Z");
    const resume = {
      position: {
        measureId: "measure-2",
        measureIndex: 2,
        beatIndex: 1,
        tick: 4320,
        cachedTimeMs: 9000,
      },
      updatedAt: "2026-07-10T03:00:00Z",
    };

    await persistence.writeSidecar(identity, sidecar);
    await persistence.writeResume(identity, resume);

    expect(await persistence.readSidecar(identity)).toEqual(sidecar);
    expect(await persistence.readResume(identity)).toEqual(resume);
  });

  it("returns undefined for identities with no saved state", async () => {
    const persistence = new BridgePlaybackPersistence(new MockNativeBridge());

    expect(await persistence.readSidecar(identity)).toBeUndefined();
    expect(await persistence.readResume(identity)).toBeUndefined();
  });
});
