import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArtifactWriter, verifyArtifactHash } from "../artifact-writer";
import { PdfOmrError } from "../errors";

describe("run artifact writer", () => {
  it("creates a new run directory and atomically writes canonical JSON", async () => {
    const parent = await mkdtemp(join(tmpdir(), "pdf-omr-artifacts-"));
    const output = join(parent, "run");
    const writer = await createArtifactWriter(output);

    const hash = await writer.writeJson("draft.json", { z: 1, a: 2 });

    expect(await readFile(join(output, "draft.json"), "utf8")).toBe('{\n  "a": 2,\n  "z": 1\n}\n');
    await expect(verifyArtifactHash(join(output, "draft.json"), hash)).resolves.toBe(true);
    expect(writer.artifactSha256()).toEqual({ "draft.json": hash });
  });

  it("does not overwrite an existing output directory", async () => {
    const output = await mkdtemp(join(tmpdir(), "pdf-omr-existing-"));

    await expect(createArtifactWriter(output)).rejects.toMatchObject<PdfOmrError>({
      code: "INVALID_INPUT",
    });
  });

  it("rejects traversal and duplicate artifact names", async () => {
    const parent = await mkdtemp(join(tmpdir(), "pdf-omr-paths-"));
    const writer = await createArtifactWriter(join(parent, "run"));
    await expect(writer.writeJson("../outside.json", {})).rejects.toMatchObject<PdfOmrError>({
      code: "INVALID_INPUT",
    });
    await writer.writeJson("metrics.json", { complete: true });
    await expect(writer.writeJson("metrics.json", { complete: false })).rejects.toMatchObject<PdfOmrError>({
      code: "INVALID_INPUT",
    });
  });

  it("detects content that no longer matches its recorded hash", async () => {
    const parent = await mkdtemp(join(tmpdir(), "pdf-omr-verify-"));
    const writer = await createArtifactWriter(join(parent, "run"));
    const hash = await writer.writeJson("run.json", { status: "running" });

    await expect(verifyArtifactHash(join(parent, "run", "run.json"), hash)).resolves.toBe(true);
    await expect(verifyArtifactHash(join(parent, "run", "run.json"), "0".repeat(64))).resolves.toBe(false);
  });
});
