import { createBridgeRequest, createDefaultSidecar } from "@zupulse/web-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLibraryModule } from "../library-module";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("createLibraryModule", () => {
  it("owns Library persistence handlers and keeps practice deletion coordinated", async () => {
    const userData = await mkdtemp(join(tmpdir(), "zupulse-library-module-"));
    roots.push(userData);
    const onStorageWarning = vi.fn();
    const module = await createLibraryModule({ userData, onStorageWarning });
    const id = crypto.randomUUID();
    const scoreIdentity = "a".repeat(64);
    const sidecar = createDefaultSidecar({ contentHash: scoreIdentity, format: "gp" }, "2026-08-15T00:00:00.000Z");
    const resume = {
      position: { measureId: "measure-1", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
      updatedAt: "2026-08-15T00:00:00.000Z",
    };

    await module.handlers["library.add"](
      createBridgeRequest("library.add", "add-1", {
        draft: {
          id,
          scoreIdentity,
          file: { fileName: "score.gp5", bytes: new Uint8Array([1, 2, 3]) },
          format: "gp",
          importedAt: "2026-08-15T00:00:00.000Z",
        },
      }),
    );
    await module.handlers["sidecar.write"](
      createBridgeRequest("sidecar.write", "sidecar-1", {
        identity: { contentHash: scoreIdentity, format: "gp" },
        libraryScoreId: id,
        payload: sidecar,
      }),
    );
    await module.handlers["playbackResume.write"](
      createBridgeRequest("playbackResume.write", "resume-1", {
        identity: { contentHash: scoreIdentity, format: "gp" },
        libraryScoreId: id,
        resume,
      }),
    );

    await module.handlers["library.delete"](createBridgeRequest("library.delete", "delete-1", { id }));

    await expect(
      module.handlers["sidecar.read"](
        createBridgeRequest("sidecar.read", "sidecar-2", {
          libraryScoreId: id,
          identity: { contentHash: scoreIdentity, format: "gp" },
        }),
      ),
    ).resolves.toEqual({ payload: undefined });
    await expect(
      module.handlers["playbackResume.read"](
        createBridgeRequest("playbackResume.read", "resume-2", {
          libraryScoreId: id,
          identity: { contentHash: scoreIdentity, format: "gp" },
        }),
      ),
    ).resolves.toEqual({ resume: undefined });
    expect(Object.keys(module.handlers)).toHaveLength(15);
    expect(onStorageWarning).not.toHaveBeenCalled();
    module.dispose();
  });
});
